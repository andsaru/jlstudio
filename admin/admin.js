const SUPABASE_URL = "https://bhdzbrayapbagddlzebw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eXn-DlF9TsiMCIIffrcCRA_-JXmzNH_";
const BUCKET_NAME = "galeria";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const loginForm = document.getElementById("loginForm");
const authCard = document.getElementById("authCard");
const adminPanel = document.getElementById("adminPanel");
const authMessage = document.getElementById("authMessage");
const uploadForm = document.getElementById("uploadForm");
const uploadMessage = document.getElementById("uploadMessage");
const imagesList = document.getElementById("imagesList");
const logoutBtn = document.getElementById("logoutBtn");

let sortableInstance = null;

function setMessage(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? "#ff8e8e" : "#aeb5c2";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createStoragePath(file, prefix = "") {
  const safeName = file.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.\-_]/g, "");

  return `${prefix}${Date.now()}-${safeName}`;
}

function getPathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

async function checkSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    setMessage(authMessage, error.message, true);
    return;
  }

  if (data.session) {
    authCard.hidden = true;
    adminPanel.hidden = false;
    logoutBtn.hidden = false;
    await loadImages();
  } else {
    authCard.hidden = false;
    adminPanel.hidden = true;
    logoutBtn.hidden = true;
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(authMessage, "Entrando...");

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setMessage(authMessage, error.message, true);
    return;
  }

  loginForm.reset();
  setMessage(authMessage, "");
  await checkSession();
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  await checkSession();
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = reject;
    img.src = url;
  });
}

async function resizeImage(file, maxSize, quality = 0.82) {
  const image = await loadImage(file);

  let { width, height } = image;

  if (width > height && width > maxSize) {
    height = Math.round((height * maxSize) / width);
    width = maxSize;
  } else if (height >= width && height > maxSize) {
    width = Math.round((width * maxSize) / height);
    height = maxSize;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      quality
    );
  });
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(uploadMessage, "Procesando imágenes...");

  const formData = new FormData(uploadForm);
  const files = document.getElementById("imageFile").files;
  const tituloBase = String(formData.get("titulo") || "").trim();
  const altBase = String(formData.get("alt") || "").trim();
  const ordenBase = Number(formData.get("orden") || 0);
  const visible = formData.get("visible") === "on";

  if (!files.length) {
    setMessage(uploadMessage, "Selecciona al menos una imagen.", true);
    return;
  }

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setMessage(uploadMessage, `Subiendo ${i + 1} de ${files.length}...`);

      const fullBlob = await resizeImage(file, 1800, 0.84);
      const thumbBlob = await resizeImage(file, 480, 0.78);

      const baseName = file.name.replace(/\.[^.]+$/, ".jpg");

      const fullFile = new File([fullBlob], baseName, {
        type: "image/jpeg",
      });

      const thumbFile = new File([thumbBlob], baseName, {
        type: "image/jpeg",
      });

      const fullPath = createStoragePath(fullFile, "full-");
      const thumbPath = createStoragePath(thumbFile, "thumb-");

      const { error: fullUploadError } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(fullPath, fullFile, { upsert: false });

      if (fullUploadError) {
        throw new Error(fullUploadError.message);
      }

      const { error: thumbUploadError } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(thumbPath, thumbFile, { upsert: false });

      if (thumbUploadError) {
        throw new Error(thumbUploadError.message);
      }

      const { data: fullUrlData } = supabaseClient.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fullPath);

      const { data: thumbUrlData } = supabaseClient.storage
        .from(BUCKET_NAME)
        .getPublicUrl(thumbPath);

      const titulo = tituloBase
        ? `${tituloBase}${files.length > 1 ? ` ${i + 1}` : ""}`
        : "";
      const alt = altBase
        ? `${altBase}${files.length > 1 ? ` ${i + 1}` : ""}`
        : "";
      const orden = ordenBase + i;

      const { error: insertError } = await supabaseClient
        .from("imagenes")
        .insert({
          titulo,
          alt,
          url: fullUrlData.publicUrl,
          thumb_url: thumbUrlData.publicUrl,
          orden,
          visible,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    uploadForm.reset();
    document.getElementById("orden").value = "0";
    document.getElementById("visible").checked = true;

    setMessage(uploadMessage, "Imágenes subidas correctamente.");
    await loadImages();
  } catch (error) {
    setMessage(uploadMessage, error.message || "Error al subir imágenes.", true);
  }
});

async function updateOrderFromDom() {
  const rows = [...imagesList.querySelectorAll(".image-row")];

  for (let i = 0; i < rows.length; i += 1) {
    const id = rows[i].dataset.id;

    const { error } = await supabaseClient
      .from("imagenes")
      .update({ orden: i })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

function initDragSort() {
  if (!imagesList || !window.Sortable) return;

  if (sortableInstance) {
    sortableInstance.destroy();
  }

  sortableInstance = new window.Sortable(imagesList, {
    animation: 150,
    ghostClass: "drag-ghost",
    dragClass: "drag-chosen",
    handle: ".image-thumb",
    onEnd: async () => {
      try {
        await updateOrderFromDom();
        await loadImages();
      } catch (error) {
        alert(`Error al guardar el orden: ${error.message}`);
      }
    },
  });
}

async function loadImages() {
  imagesList.innerHTML = '<p class="muted">Cargando imágenes...</p>';

  const { data, error } = await supabaseClient
    .from("imagenes")
    .select("*")
    .order("orden", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    imagesList.innerHTML = `<p class="muted">Error: ${error.message}</p>`;
    return;
  }

  if (!data || !data.length) {
    imagesList.innerHTML = '<p class="muted">Todavía no hay imágenes.</p>';
    return;
  }

  imagesList.innerHTML = "";

  data.forEach((item) => {
    const row = document.createElement("article");
    row.className = "image-row";
    row.dataset.id = item.id;

    row.innerHTML = `
      <div class="image-thumb" title="Arrastra para reordenar">
        <img src="${item.thumb_url || item.url}" alt="${escapeHtml(item.alt || item.titulo || "Imagen")}">
      </div>

      <div class="image-edit">
        <div class="form-group">
          <label>Título</label>
          <input type="text" value="${escapeHtml(item.titulo || "")}" data-field="titulo">
        </div>

        <div class="form-group">
          <label>Alt</label>
          <input type="text" value="${escapeHtml(item.alt || "")}" data-field="alt">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Orden</label>
            <input type="number" value="${item.orden ?? 0}" data-field="orden">
          </div>

          <label class="checkbox-row checkbox-row--inline">
            <input type="checkbox" ${item.visible ? "checked" : ""} data-field="visible">
            <span>Visible</span>
          </label>
        </div>

        <p class="muted">${item.url}</p>
      </div>

      <div class="image-actions">
        <button class="primary-btn" type="button" data-action="save">Guardar</button>
        <button class="danger-btn" type="button" data-action="delete">Borrar</button>
      </div>
    `;

    const saveBtn = row.querySelector('[data-action="save"]');
    const deleteBtn = row.querySelector('[data-action="delete"]');

    saveBtn.addEventListener("click", async () => {
      const titulo = row.querySelector('[data-field="titulo"]').value.trim();
      const alt = row.querySelector('[data-field="alt"]').value.trim();
      const orden = Number(row.querySelector('[data-field="orden"]').value || 0);
      const visible = row.querySelector('[data-field="visible"]').checked;

      saveBtn.textContent = "Guardando...";

      const { error: updateError } = await supabaseClient
        .from("imagenes")
        .update({ titulo, alt, orden, visible })
        .eq("id", item.id);

      saveBtn.textContent = "Guardar";

      if (updateError) {
        alert(`Error al guardar: ${updateError.message}`);
        return;
      }

      await loadImages();
    });

    deleteBtn.addEventListener("click", async () => {
      const ok = window.confirm("¿Seguro que quieres borrar esta imagen?");
      if (!ok) return;

      deleteBtn.textContent = "Borrando...";

      const { error: dbError } = await supabaseClient
        .from("imagenes")
        .delete()
        .eq("id", item.id);

      if (dbError) {
        deleteBtn.textContent = "Borrar";
        alert(`Error al borrar en base de datos: ${dbError.message}`);
        return;
      }

      const paths = [getPathFromPublicUrl(item.url), getPathFromPublicUrl(item.thumb_url)]
        .filter(Boolean);

      if (paths.length) {
        await supabaseClient.storage.from(BUCKET_NAME).remove(paths);
      }

      await loadImages();
    });

    imagesList.appendChild(row);
  });

  initDragSort();
}

supabaseClient.auth.onAuthStateChange(() => {
  checkSession();
});

checkSession();