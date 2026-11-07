<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { parseArticleUrl } from "../shared/article-url";
import { PAPER_IDS, PAPER_SIZES, isPaperId, type PaperId } from "../shared/paper";
import { readBookletStream, type StreamUpdate } from "./booklet-stream";
import { describe, formatElapsed, percent, type ProgressState } from "./progress";
import { deleteBooklet, listBooklets, saveBooklet, type SavedBooklet } from "./store";

/** A booklet being made. It becomes a SavedBooklet when it's done. */
interface Job {
  id: string;
  title: string;
  sourceUrl: string;
  paper: PaperId;
  references: boolean;
  grayscale: boolean;
  startedAt: number;
  progress: ProgressState;
  /** Percent shown on the bar; never goes backwards. */
  shown: number;
  error: string | null;
  finishedAt: number | null;
}

const url = ref("");
const paper = ref<PaperId>(initialPaper());
const references = ref(readSetting("references") !== "no");
const grayscale = ref(readSetting("grayscale") === "yes");
const error = ref("");
const jobs = ref<Job[]>([]);
const booklets = ref<SavedBooklet[]>([]);
const latestId = ref<string | null>(null);
const storageBroken = ref(false);
const now = ref(Date.now());
const confirmDialog = ref<HTMLDialogElement | null>(null);
const toDelete = ref<SavedBooklet | null>(null);

let ticker: ReturnType<typeof setInterval> | undefined;

const urlLooksWrong = computed(() => url.value.trim() !== "" && !parseArticleUrl(url.value));

watch(paper, (value) => writeSetting("paper", value));
watch(references, (value) => writeSetting("references", value ? "yes" : "no"));
watch(grayscale, (value) => writeSetting("grayscale", value ? "yes" : "no"));

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

onMounted(refresh);
onBeforeUnmount(() => clearInterval(ticker));

function initialPaper(): PaperId {
  const saved = readSetting("paper");
  if (isPaperId(saved)) return saved;
  const region = new Intl.Locale(navigator.language).maximize().region ?? "";
  return ["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "CR", "PA", "DO", "SV", "NI", "PR"].includes(region)
    ? "letter"
    : "a4";
}

async function refresh() {
  try {
    booklets.value = await listBooklets();
  } catch {
    storageBroken.value = true;
  }
}

/** Keeps the bars and timers moving while anything is being made. */
function tick() {
  now.value = Date.now();
  const running = jobs.value.filter((j) => !j.error);
  for (const job of running) job.shown = Math.max(job.shown, percent(job.progress, now.value));
  if (running.length === 0) {
    clearInterval(ticker);
    ticker = undefined;
  }
}

function setStage(job: Job, next: Omit<ProgressState, "since">) {
  const same = job.progress.stage === next.stage && job.progress.pass === next.pass;
  job.progress = { ...next, since: same ? job.progress.since : Date.now() };
  job.shown = Math.max(job.shown, percent(job.progress, Date.now()));
}

function onUpdate(job: Job, u: StreamUpdate) {
  if (u.stage === "loading") setStage(job, { stage: "loading", done: u.done, total: u.total });
  else if (u.stage === "printing") setStage(job, { stage: "printing", pass: u.pass });
  else if (u.stage === "downloading") setStage(job, { stage: "downloading", done: u.received, total: u.total });
  else setStage(job, { stage: u.stage });
}

function submit() {
  error.value = "";
  const article = parseArticleUrl(url.value);
  if (!article) {
    error.value = "That doesn't look like a link to a Wikipedia article.";
    return;
  }
  const job: Job = {
    id: crypto.randomUUID(),
    title: article.title,
    sourceUrl: url.value.trim(),
    paper: paper.value,
    references: references.value,
    grayscale: grayscale.value,
    startedAt: Date.now(),
    progress: { stage: "sending", since: Date.now() },
    shown: 0,
    error: null,
    finishedAt: null,
  };
  jobs.value.unshift(job);
  url.value = "";
  // Work on the reactive copy, so progress updates show.
  run(jobs.value[0]);
}

async function run(job: Job) {
  ticker ??= setInterval(tick, 250);
  try {
    const res = await fetch("/api/booklet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: job.sourceUrl,
        paper: job.paper,
        references: job.references,
        grayscale: job.grayscale,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `The server returned an error (${res.status}).`);
    }

    const { title, pdf } = await readBookletStream(res, (u) => onUpdate(job, u));
    job.title = title;

    setStage(job, { stage: "arranging" });
    const { impose } = await import("./impose"); // pdf-lib is large; load it only when needed
    const result = await impose(pdf.buffer as ArrayBuffer, title);

    setStage(job, { stage: "saving" });
    const booklet: SavedBooklet = {
      id: job.id,
      title,
      sourceUrl: job.sourceUrl,
      paper: job.paper,
      pages: result.pages,
      sheets: result.sheets,
      createdAt: Date.now(),
      pdf: new Blob([result.bytes as BlobPart], { type: "application/pdf" }),
    };
    try {
      await saveBooklet(booklet);
      await refresh();
    } catch {
      storageBroken.value = true;
      booklets.value = [booklet, ...booklets.value];
    }
    jobs.value = jobs.value.filter((j) => j.id !== job.id);
    latestId.value = booklet.id;
  } catch (err) {
    job.error = err instanceof Error ? err.message : String(err);
    job.finishedAt = Date.now();
  }
}

function retry(job: Job) {
  Object.assign(job, {
    startedAt: Date.now(),
    progress: { stage: "sending", since: Date.now() },
    shown: 0,
    error: null,
    finishedAt: null,
  });
  run(job);
}

function dismiss(job: Job) {
  jobs.value = jobs.value.filter((j) => j.id !== job.id);
}

function download(b: SavedBooklet) {
  const href = URL.createObjectURL(b.pdf);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${filename(b.title)} - booklet - ${paperName(b.paper)}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Asks before deleting: booklets live only in this browser, so it can't be undone. */
function askToRemove(b: SavedBooklet) {
  toDelete.value = b;
  confirmDialog.value?.showModal();
}

async function onConfirmClose() {
  const b = toDelete.value;
  toDelete.value = null;
  if (!b || confirmDialog.value?.returnValue !== "delete") return;
  try {
    await deleteBooklet(b.id);
  } catch {}
  booklets.value = booklets.value.filter((x) => x.id !== b.id);
}

function paperName(id: PaperId) {
  return PAPER_SIZES[id].label.split(" ")[0];
}

function filename(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "article";
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
</script>

<template>
  <main>
    <h1>Wikipedia article to booklet</h1>
    <p>
      Paste a link to a Wikipedia article. You'll get a PDF to print double-sided,
      fold in half, and staple along the fold.
    </p>

    <form @submit.prevent="submit">
      <label for="url">Article link</label>
      <input
        id="url"
        v-model="url"
        type="url"
        placeholder="https://en.wikipedia.org/wiki/…"
        autocomplete="off"
        spellcheck="false"
        required
        :aria-invalid="urlLooksWrong"
      />

      <label for="paper">Paper</label>
      <select id="paper" v-model="paper">
        <option v-for="id in PAPER_IDS" :key="id" :value="id">{{ PAPER_SIZES[id].label }}</option>
      </select>

      <fieldset class="options">
        <legend>Options</legend>
        <label class="check">
          <input v-model="references" type="checkbox" />
          Include references
        </label>
        <label class="check">
          <input v-model="grayscale" type="checkbox" />
          Black and white (uses less colour ink)
        </label>
      </fieldset>

      <div>
        <button type="submit">Make booklet</button>
      </div>
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <section v-if="jobs.length || booklets.length">
      <h2>Your booklets</h2>
      <p class="note">
        {{ storageBroken ? "This browser isn't letting the page save files, so these will be gone when you leave." : "Kept in this browser only." }}
      </p>
      <ul class="booklets">
        <li v-for="job in jobs" :key="job.id" class="job">
          <a :href="job.sourceUrl" rel="noreferrer" target="_blank">{{ job.title }}</a>
          <span class="note">{{ paperName(job.paper) }}</span>
          <template v-if="!job.error">
            <div
              class="bar"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Math.round(job.shown)"
              :aria-label="`Making ${job.title}`"
            >
              <div class="fill" :style="{ width: `${job.shown}%` }"></div>
            </div>
            <span class="note status">
              <span aria-live="polite">{{ describe(job.progress) }}</span>
              · {{ formatElapsed(now - job.startedAt) }}
            </span>
          </template>
          <template v-else>
            <span class="error status" role="alert">{{ job.error }}</span>
            <span class="actions">
              <button type="button" @click="retry(job)">Try again</button>
              <button type="button" class="plain" @click="dismiss(job)">Remove</button>
            </span>
          </template>
        </li>
        <li v-for="b in booklets" :key="b.id" :class="{ latest: b.id === latestId }">
          <a :href="b.sourceUrl" rel="noreferrer" target="_blank">{{ b.title }}</a>
          <span class="note">
            {{ paperName(b.paper) }}, {{ b.sheets }} {{ b.sheets === 1 ? "sheet" : "sheets" }},
            {{ formatDate(b.createdAt) }}
          </span>
          <span class="actions">
            <button type="button" @click="download(b)">Download</button>
            <button type="button" class="plain" @click="askToRemove(b)">Delete</button>
          </span>
        </li>
      </ul>
    </section>

    <dialog ref="confirmDialog" class="confirm" aria-labelledby="confirm-title" @close="onConfirmClose">
      <form method="dialog">
        <p id="confirm-title">Delete “{{ toDelete?.title }}”?</p>
        <p class="note">It's only saved in this browser, so it can't be recovered. You can always make it again.</p>
        <div class="confirm-actions">
          <button value="delete">Delete</button>
          <button value="cancel" class="plain" autofocus>Cancel</button>
        </div>
      </form>
    </dialog>

    <section>
      <h2>Printing</h2>
      <ol>
        <li>Print at actual size (100%), not "fit to page".</li>
        <li>Print on both sides, flipping on the <em>short</em> edge.</li>
        <li>Keep the sheets in order, fold the stack in half, and staple on the two marks along the fold.</li>
      </ol>
      <p class="note">
        If your printer can't print both sides, print the odd pages, put the stack back in,
        then print the even pages.
      </p>
    </section>

    <footer class="note">
      Article text from Wikipedia, CC BY-SA 4.0.
      <a href="https://github.com/wengel-eth/wiki-article-to-booklet">Source</a>
    </footer>
  </main>
</template>
