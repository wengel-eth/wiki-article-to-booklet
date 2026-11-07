<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { parseArticleUrl } from "../shared/article-url";
import { PAPER_IDS, PAPER_SIZES, isPaperId, type PaperId } from "../shared/paper";
import { deleteBooklet, listBooklets, saveBooklet, type SavedBooklet } from "./store";

const url = ref("");
const paper = ref<PaperId>(initialPaper());
const busy = ref(false);
const status = ref("");
const error = ref("");
const elapsed = ref(0);
const booklets = ref<SavedBooklet[]>([]);
const latestId = ref<string | null>(null);
const storageBroken = ref(false);

let timer: ReturnType<typeof setInterval> | undefined;

const urlLooksWrong = computed(() => url.value.trim() !== "" && !parseArticleUrl(url.value));

watch(paper, (value) => {
  try {
    localStorage.setItem("paper", value);
  } catch {}
});

onMounted(refresh);
onBeforeUnmount(() => clearInterval(timer));

function initialPaper(): PaperId {
  try {
    const saved = localStorage.getItem("paper");
    if (isPaperId(saved)) return saved;
  } catch {}
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

async function submit() {
  error.value = "";
  const article = parseArticleUrl(url.value);
  if (!article) {
    error.value = "That doesn't look like a link to a Wikipedia article.";
    return;
  }

  busy.value = true;
  elapsed.value = 0;
  status.value = "Fetching the article and laying out pages";
  timer = setInterval(() => elapsed.value++, 1000);

  try {
    const res = await fetch("/api/booklet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url.value.trim(), paper: paper.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `The server returned an error (${res.status}).`);
    }

    const title = decodeURIComponent(res.headers.get("x-article-title") ?? "") || article.title;
    status.value = "Arranging pages for folding";
    const { impose } = await import("./impose"); // pdf-lib is large; load it only when needed
    const result = await impose(await res.arrayBuffer(), title);

    const booklet: SavedBooklet = {
      id: crypto.randomUUID(),
      title,
      sourceUrl: url.value.trim(),
      paper: paper.value,
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
    latestId.value = booklet.id;
    url.value = "";
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    clearInterval(timer);
    busy.value = false;
    status.value = "";
  }
}

function download(b: SavedBooklet) {
  const href = URL.createObjectURL(b.pdf);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${filename(b.title)} - booklet - ${PAPER_SIZES[b.paper].label.split(" ")[0]}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

async function remove(b: SavedBooklet) {
  try {
    await deleteBooklet(b.id);
  } catch {}
  booklets.value = booklets.value.filter((x) => x.id !== b.id);
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
        :disabled="busy"
        :aria-invalid="urlLooksWrong"
      />

      <label for="paper">Paper</label>
      <select id="paper" v-model="paper" :disabled="busy">
        <option v-for="id in PAPER_IDS" :key="id" :value="id">{{ PAPER_SIZES[id].label }}</option>
      </select>

      <div>
        <button type="submit" :disabled="busy">{{ busy ? "Working…" : "Make booklet" }}</button>
      </div>
    </form>

    <p v-if="busy" class="note" role="status">{{ status }}… {{ elapsed }}s</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <section v-if="booklets.length">
      <h2>Your booklets</h2>
      <p class="note">
        {{ storageBroken ? "This browser isn't letting the page save files, so these will be gone when you leave." : "Kept in this browser only." }}
      </p>
      <ul class="booklets">
        <li v-for="b in booklets" :key="b.id" :class="{ latest: b.id === latestId }">
          <a :href="b.sourceUrl" rel="noreferrer" target="_blank">{{ b.title }}</a>
          <span class="note">
            {{ PAPER_SIZES[b.paper].label.split(" ")[0] }}, {{ b.sheets }} {{ b.sheets === 1 ? "sheet" : "sheets" }},
            {{ formatDate(b.createdAt) }}
          </span>
          <span class="actions">
            <button type="button" @click="download(b)">Download</button>
            <button type="button" class="plain" @click="remove(b)">Delete</button>
          </span>
        </li>
      </ul>
    </section>

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
