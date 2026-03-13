(() => {
  "use strict";

  const SUPABASE_URL = "https://bhdzbrayapbagddlzebw.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_eXn-DlF9TsiMCIIffrcCRA_-JXmzNH_";

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  const gallery = document.getElementById("gallery");
  const galleryStatus = document.getElementById("galleryStatus");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxStage = document.getElementById("lightboxStage");
  const backdrop = document.querySelector(".lightbox__backdrop");
  const btnClose = document.querySelector("[data-close]");
  const btnPrev = document.querySelector("[data-prev]");
  const btnNext = document.querySelector("[data-next]");
  const counter = document.getElementById("lightboxCounter");

  let items = [];
  let currentIndex = 0;
  let pendingImageToken = 0;

  let scale = 1;
  let tx = 0;
  let ty = 0;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;

  const MIN_SCALE = 1;
  const MAX_SCALE = 6;

  function updateCounter() {
    if (!counter) return;
    counter.textContent = items.length
      ? `${currentIndex + 1} / ${items.length}`
      : "0 / 0";
  }

  function applyTransform() {
    if (!lightboxImg) return;
    lightboxImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function resetZoom() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  function loadLightboxImage(index, openIfNeeded = false) {
    const item = items[index];
    if (!item || !lightboxImg) return;

    currentIndex = index;
    const myToken = ++pendingImageToken;

    lightboxImg.classList.remove("is-ready");
    lightboxImg.removeAttribute("src");
    lightboxImg.alt = item.alt || "";

    const preloader = new Image();
    preloader.onload = () => {
      if (myToken !== pendingImageToken) return;

      lightboxImg.src = item.fullSrc;
      lightboxImg.alt = item.alt || "";
      updateCounter();
      resetZoom();

      requestAnimationFrame(() => {
        lightboxImg.classList.add("is-ready");
      });

      if (openIfNeeded && lightbox) {
        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
      }
    };

    preloader.src = item.fullSrc;
  }

  function openLightbox(index) {
    const item = items[index];
    if (!item) return;
    loadLightboxImage(index, true);
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;

    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    isDragging = false;
    resetZoom();

    pendingImageToken++;
    lightboxImg.classList.remove("is-ready");
    lightboxImg.removeAttribute("src");
    lightboxImg.alt = "";
  }

  function showImage(index) {
    const item = items[index];
    if (!item) return;
    loadLightboxImage(index, false);
  }

  function showPrev() {
    if (!items.length) return;
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    showImage(currentIndex);
  }

  function showNext() {
    if (!items.length) return;
    currentIndex = (currentIndex + 1) % items.length;
    showImage(currentIndex);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function buildGalleryRows(rows) {
    if (!gallery) return;

    items = rows.map((row) => ({
      thumbSrc: row.thumb_url || row.url,
      fullSrc: row.url,
      alt: row.alt || row.titulo || "Miniatura pintada",
      title: row.titulo || "",
    }));

    gallery.innerHTML = "";

    if (!rows.length) {
      gallery.innerHTML =
        '<p class="page-subtitle">Todavía no hay imágenes publicadas.</p>';
      return;
    }

    rows.forEach((row, index) => {
      const button = document.createElement("button");
      button.className = "gallery-item";
      button.type = "button";
      button.setAttribute("aria-label", `Miniatura ${index + 1}`);

      button.innerHTML = `
        <img
          src="${escapeHtml(row.thumb_url || row.url)}"
          alt="${escapeHtml(
            row.alt || row.titulo || `Miniatura pintada ${index + 1}`
          )}"
          loading="lazy"
        >
      `;

      button.addEventListener("click", () => openLightbox(index));
      gallery.appendChild(button);
    });
  }

  async function loadGallery() {
    if (!gallery) return;

    if (galleryStatus) {
      galleryStatus.textContent = "Cargando galería...";
    }

    const { data, error } = await supabaseClient
      .from("imagenes")
      .select("id, titulo, alt, url, thumb_url, orden, visible, created_at")
      .eq("visible", true)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      gallery.innerHTML =
        '<p class="page-subtitle">Error al cargar la galería.</p>';
      console.error("Error cargando galería:", error);
      return;
    }

    buildGalleryRows(data || []);

    if (galleryStatus) {
      galleryStatus.textContent = "";
    }
  }

  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeLightbox();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeLightbox);
  }

  if (lightboxStage) {
    lightboxStage.addEventListener("click", (e) => {
      if (e.target === lightboxStage) {
        closeLightbox();
      }
    });

    lightboxStage.addEventListener(
      "wheel",
      (e) => {
        if (!lightbox || !lightbox.classList.contains("is-open")) return;

        e.preventDefault();

        const rect = lightboxStage.getBoundingClientRect();
        const cx = e.clientX - (rect.left + rect.width / 2);
        const cy = e.clientY - (rect.top + rect.height / 2);

        const previousScale = scale;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));

        const k = scale / previousScale;
        tx = tx - cx * (k - 1);
        ty = ty - cy * (k - 1);

        if (scale === 1) {
          tx = 0;
          ty = 0;
        }

        applyTransform();
      },
      { passive: false }
    );

    lightboxStage.addEventListener("pointerdown", (e) => {
      if (!lightbox || !lightbox.classList.contains("is-open")) return;
      if (scale <= 1) return;

      isDragging = true;
      lightboxStage.setPointerCapture(e.pointerId);

      startX = e.clientX;
      startY = e.clientY;
      startTx = tx;
      startTy = ty;
    });

    lightboxStage.addEventListener("pointermove", (e) => {
      if (!isDragging) return;

      tx = startTx + (e.clientX - startX);
      ty = startTy + (e.clientY - startY);
      applyTransform();
    });

    lightboxStage.addEventListener("pointerup", () => {
      isDragging = false;
    });

    lightboxStage.addEventListener("pointercancel", () => {
      isDragging = false;
    });

    lightboxStage.addEventListener("dblclick", (e) => {
      e.preventDefault();
      resetZoom();
    });
  }

  if (lightboxImg) {
    lightboxImg.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener("click", (e) => {
      e.stopPropagation();
      showPrev();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", (e) => {
      e.stopPropagation();
      showNext();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (!lightbox || !lightbox.classList.contains("is-open")) return;

    if (e.key === "Escape") {
      closeLightbox();
    } else if (e.key === "ArrowLeft") {
      showPrev();
    } else if (e.key === "ArrowRight") {
      showNext();
    }
  });

  window.addEventListener("resize", () => {
    if (!lightbox || !lightbox.classList.contains("is-open")) return;
    resetZoom();
  });

  // =========================
  // ACCESO ADMIN: FLECHA ARRIBA + 5 CLICS
  // =========================
  const logoAdminTrigger = document.querySelector(".brand");
  const ADMIN_URL = "https://andsaru.github.io/jlstudio/admin/admin.html";

  let adminClickCount = 0;
  let adminClickTimer = null;
  let arrowUpPressed = false;

  const REQUIRED_CLICKS = 5;
  const CLICK_TIMEOUT = 2500;

  function resetAdminClicks() {
    adminClickCount = 0;

    if (adminClickTimer) {
      clearTimeout(adminClickTimer);
      adminClickTimer = null;
    }
  }

  // Detectar flecha arriba
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      arrowUpPressed = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowUp") {
      arrowUpPressed = false;
      resetAdminClicks();
    }
  });

  if (logoAdminTrigger) {
    logoAdminTrigger.style.cursor = "pointer";

    logoAdminTrigger.addEventListener("click", (e) => {

      if (!arrowUpPressed) {
        resetAdminClicks();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      adminClickCount++;

      clearTimeout(adminClickTimer);

      adminClickTimer = setTimeout(() => {
        resetAdminClicks();
      }, CLICK_TIMEOUT);

      if (adminClickCount >= REQUIRED_CLICKS) {
        resetAdminClicks();
        window.location.href = ADMIN_URL;
      }

    });
  }

  loadGallery();
})();