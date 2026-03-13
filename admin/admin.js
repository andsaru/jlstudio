(() => {
  "use strict";

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
  let isLoadingImages = false;

  function setMessage(el, text, isError = false) {
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#ff8e8e" : "#aeb5c2";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function createStoragePath(file, prefix = "") {
    const safeName = String(file.name || "archivo.jpg")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9.\-_]/g, "");

    return `${prefix}${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;
  }

  function getPathFromPublicUrl(url) {
    if (!url) return null;

    const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const index = url.indexOf(marker);

    if (index === -1) return null;

    return decodeURIComponent(url.slice(index + marker.length));
  }

  function setAuthUi(isLoggedIn) {
    if (authCard) authCard.hidden = isLoggedIn;
    if (adminPanel) adminPanel.hidden = !isLoggedIn;
    if (logoutBtn) logoutBtn.hidden = !isLoggedIn;
  }

  async function getSessionSafe() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      throw new Error(error.message || "No se pudo comprobar la sesión.");
    }

    return data.session ?? null;
  }

  async function checkSession({ load = true } = {}) {
    try {
      const session = await getSessionSafe();

      if (session) {
        setAuthUi(true);
        setMessage(authMessage, "");

        if (load) {
          await loadImages();
        }
      } else {
        setAuthUi(false);
        setMessage(authMessage, "");
      }
    } catch (error) {
      setAuthUi(false);
      setMessage(
        authMessage,
        error.message || "Error comprobando la sesión.",
        true
      );
    }
  }

  async function requireSession() {
    const session = await getSessionSafe();

    if (!session) {
      setAuthUi(false);
      throw new Error("Tu sesión ha caducado. Vuelve a iniciar sesión.");
    }

    return session;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se ha podido leer la imagen seleccionada."));
      };

      img.src = url;
    });
  }

  async function resizeImage(file, maxSize, quality = 0.82) {
    const image = await loadImage(file);

    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error("La imagen no tiene dimensiones válidas.");
    }

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
    if (!ctx) {
      throw new Error("No se ha podido procesar la imagen.");
    }

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) {
      throw new Error("No se ha podido convertir la imagen.");
    }

    return blob;
  }

  async function uploadSingleImage({
    file,
    tituloBase,
    altBase,
    orden,
    visible,
    index,
    totalFiles,
  }) {
    const fullBlob = await resizeImage(file, 1800, 0.84);
    const thumbBlob = await resizeImage(file, 480, 0.78);

    const baseName = String(file.name || "imagen").replace(/\.[^.]+$/, ".jpg");

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
      .upload(fullPath, fullFile, {
        upsert: false,
        contentType: "image/jpeg",
      });

    if (fullUploadError) {
      throw new Error(fullUploadError.message);
    }

    const { error: thumbUploadError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(thumbPath, thumbFile, {
        upsert: false,
        contentType: "image/jpeg",
      });

    if (thumbUploadError) {
      await supabaseClient.storage.from(BUCKET_NAME).remove([fullPath]);
      throw new Error(thumbUploadError.message);
    }

    const { data: fullUrlData } = supabaseClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fullPath);

    const { data: thumbUrlData } = supabaseClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(thumbPath);

    const suffix = totalFiles > 1 ? ` ${index + 1}` : "";
    const titulo = tituloBase ? `${tituloBase}${suffix}` : "";
    const alt = altBase ? `${altBase}${suffix}` : "";

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
      await supabaseClient.storage
        .from(BUCKET_NAME)
        .remove([fullPath, thumbPath]);

      throw new Error(insertError.message);
    }
  }

  async function updateOrderFromDom() {
    if (!imagesList) return;

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
      sortableInstance = null;
    }

    sortableInstance = new window.Sortable(imagesList, {
      animation: 150,
      ghostClass: "drag-ghost",
      dragClass: "drag-chosen",
      handle: ".image-thumb",
      onEnd: async () => {
        try {
          await requireSession();
          await updateOrderFromDom();
          await loadImages();
        } catch (error) {
          alert(`Error al guardar el orden: ${error.message}`);
        }
      },
    });
  }

  async function loadImages() {
    if (!imagesList || isLoadingImages) return;

    isLoadingImages = true;
    imagesList.innerHTML = '<p class="muted">Cargando imágenes...</p>';

    try {
      await requireSession();

      const { data, error } = await supabaseClient
        .from("imagenes")
        .select("*")
        .order("orden", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        imagesList.innerHTML = `<p class="muted">Error: ${escapeHtml(
          error.message
        )}</p>`;
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
            <img
              src="${escapeHtml(item.thumb_url || item.url || "")}"
              alt="${escapeHtml(item.alt || item.titulo || "Imagen")}"
            >
          </div>

          <div class="image-edit">
            <div class="form-group">
              <label>Título</label>
              <input
                type="text"
                value="${escapeHtml(item.titulo || "")}"
                data-field="titulo"
              >
            </div>

            <div class="form-group">
              <label>Alt</label>
              <input
                type="text"
                value="${escapeHtml(item.alt || "")}"
                data-field="alt"
              >
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Orden</label>
                <input
                  type="number"
                  value="${Number(item.orden ?? 0)}"
                  data-field="orden"
                >
              </div>

              <label class="checkbox-row checkbox-row--inline">
                <input
                  type="checkbox"
                  ${item.visible ? "checked" : ""}
                  data-field="visible"
                >
                <span>Visible</span>
              </label>
            </div>

            <p class="muted">${escapeHtml(item.url || "")}</p>
          </div>

          <div class="image-actions">
            <button class="primary-btn" type="button" data-action="save">
              Guardar
            </button>
            <button class="danger-btn" type="button" data-action="delete">
              Borrar
            </button>
          </div>
        `;

        const saveBtn = row.querySelector('[data-action="save"]');
        const deleteBtn = row.querySelector('[data-action="delete"]');

        saveBtn?.addEventListener("click", async () => {
          try {
            await requireSession();

            const titulo = row
              .querySelector('[data-field="titulo"]')
              .value.trim();

            const alt = row.querySelector('[data-field="alt"]').value.trim();

            const orden = Number(
              row.querySelector('[data-field="orden"]').value || 0
            );

            const visible = row.querySelector(
              '[data-field="visible"]'
            ).checked;

            saveBtn.disabled = true;
            saveBtn.textContent = "Guardando...";

            const { error: updateError } = await supabaseClient
              .from("imagenes")
              .update({ titulo, alt, orden, visible })
              .eq("id", item.id);

            if (updateError) {
              throw new Error(updateError.message);
            }

            await loadImages();
          } catch (error) {
            alert(`Error al guardar: ${error.message}`);
          } finally {
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.textContent = "Guardar";
            }
          }
        });

        deleteBtn?.addEventListener("click", async () => {
          const ok = window.confirm("¿Seguro que quieres borrar esta imagen?");
          if (!ok) return;

          try {
            await requireSession();

            deleteBtn.disabled = true;
            deleteBtn.textContent = "Borrando...";

            const { error: dbError } = await supabaseClient
              .from("imagenes")
              .delete()
              .eq("id", item.id);

            if (dbError) {
              throw new Error(
                `Error al borrar en base de datos: ${dbError.message}`
              );
            }

            const paths = [
              getPathFromPublicUrl(item.url),
              getPathFromPublicUrl(item.thumb_url),
            ].filter(Boolean);

            if (paths.length) {
              const { error: storageError } = await supabaseClient.storage
                .from(BUCKET_NAME)
                .remove(paths);

              if (storageError) {
                console.warn("No se pudieron borrar archivos de Storage:", storageError);
              }
            }

            await loadImages();
          } catch (error) {
            alert(error.message);
          } finally {
            if (deleteBtn) {
              deleteBtn.disabled = false;
              deleteBtn.textContent = "Borrar";
            }
          }
        });

        imagesList.appendChild(row);
      });

      initDragSort();
    } catch (error) {
      imagesList.innerHTML = `<p class="muted">${escapeHtml(
        error.message || "Error cargando imágenes."
      )}</p>`;
    } finally {
      isLoadingImages = false;
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        setMessage(authMessage, "Entrando...");
        const formData = new FormData(loginForm);
        const email = String(formData.get("email") || "").trim();
        const password = String(formData.get("password") || "").trim();

        if (!email || !password) {
          throw new Error("Introduce correo y contraseña.");
        }

        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw new Error(error.message);
        }

        loginForm.reset();
        setMessage(authMessage, "");
        await checkSession();
      } catch (error) {
        setMessage(authMessage, error.message || "No se pudo iniciar sesión.", true);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await supabaseClient.auth.signOut();
      } finally {
        await checkSession({ load: false });
      }
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        await requireSession();
        setMessage(uploadMessage, "Procesando imágenes...");

        const formData = new FormData(uploadForm);
        const fileInput = document.getElementById("imageFile");
        const files = fileInput?.files ? Array.from(fileInput.files) : [];

        const tituloBase = String(formData.get("titulo") || "").trim();
        const altBase = String(formData.get("alt") || "").trim();
        const ordenBase = Number(formData.get("orden") || 0);
        const visible = formData.get("visible") === "on";

        if (!files.length) {
          throw new Error("Selecciona al menos una imagen.");
        }

        for (let i = 0; i < files.length; i += 1) {
          setMessage(uploadMessage, `Subiendo ${i + 1} de ${files.length}...`);

          await uploadSingleImage({
            file: files[i],
            tituloBase,
            altBase,
            orden: ordenBase + i,
            visible,
            index: i,
            totalFiles: files.length,
          });
        }

        uploadForm.reset();

        const ordenInput = document.getElementById("orden");
        const visibleInput = document.getElementById("visible");

        if (ordenInput) ordenInput.value = "0";
        if (visibleInput) visibleInput.checked = true;

        setMessage(uploadMessage, "Imágenes subidas correctamente.");
        await loadImages();
      } catch (error) {
        setMessage(
          uploadMessage,
          error.message || "Error al subir imágenes.",
          true
        );
      }
    });
  }

  supabaseClient.auth.onAuthStateChange(() => {
    checkSession();
  });

  checkSession({ load: true });
})();