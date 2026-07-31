class ProfilePhotoEditor {
  constructor() {
    this.modal = null;
    this.selectionScreen = null;
    this.editorScreen = null;
    this.cropImage = null;
    this.cropContainer = null;
    this.currentImage = null;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.startPinchDistance = 0;
    this.minZoom = 1;
    this.maxZoom = 2;
    this.recentAvatars = [];
    this.init();
  }

  init() {
    this.loadRecentAvatars();
    this.createModal();
    this.bindEvents();
  }

  loadRecentAvatars() {
    const saved = localStorage.getItem('recentAvatars');
    if (saved) {
      this.recentAvatars = JSON.parse(saved);
    }
  }

  saveRecentAvatars() {
    localStorage.setItem('recentAvatars', JSON.stringify(this.recentAvatars.slice(0, 8)));
  }

  addToRecentAvatars(imageData) {
    if (!this.recentAvatars.includes(imageData)) {
      this.recentAvatars.unshift(imageData);
      this.saveRecentAvatars();
    }
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'profile-photo-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', 'Editor de foto de perfil');

    this.modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modalTitle">Selecione uma imagem</h2>
          <button class="modal-close-btn" id="modalCloseBtn">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <!-- Selection Screen -->
          <div class="selection-screen" id="selectionScreen">
            <div class="upload-section">
              <div class="upload-box" id="uploadBox">
                <i class="fas fa-image"></i>
                <span>Enviar imagem</span>
                <input type="file" id="hiddenFileInput" accept="image/jpeg,image/jpg,image/png,image/webp" style="display: none;" />
              </div>
            </div>
            <div class="recent-avatars-section" id="recentAvatarsSection" style="display: none;">
              <h3>Avatare Recentes</h3>
              <p>Acesse seus envios de Avatar mais recentes.</p>
              <div class="recent-avatars-grid" id="recentAvatarsGrid"></div>
            </div>
          </div>
          <!-- Editor Screen -->
          <div class="editor-screen" id="editorScreen">
            <div class="crop-area">
              <div class="crop-image-container" id="cropImageContainer">
                <img class="crop-image" id="cropImage" src="" alt="Foto para recorte" />
              </div>
              <div class="crop-overlay"></div>
              <div class="crop-circle"></div>
              <div class="zoom-slider-container">
                <i class="fas fa-search-minus zoom-icon"></i>
                <input type="range" class="zoom-slider" id="zoomSlider" min="50" max="200" value="100" />
                <i class="fas fa-search-plus zoom-icon"></i>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" id="modalFooter">
          <button class="modal-btn cancel" id="cancelBtn">Cancelar</button>
          <button class="modal-btn choose" id="chooseBtn">Escolher</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    this.selectionScreen = document.getElementById('selectionScreen');
    this.editorScreen = document.getElementById('editorScreen');
    this.cropImage = document.getElementById('cropImage');
    this.cropContainer = document.getElementById('cropImageContainer');
  }

  bindEvents() {
    const closeBtn = document.getElementById('modalCloseBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const chooseBtn = document.getElementById('chooseBtn');
    const zoomSlider = document.getElementById('zoomSlider');
    const uploadBox = document.getElementById('uploadBox');
    const hiddenFileInput = document.getElementById('hiddenFileInput');

    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.handleCancel());
    chooseBtn.addEventListener('click', () => this.save());
    zoomSlider.addEventListener('input', (e) => {
      this.zoom = e.target.value / 100;
      this.updateImageTransform();
    });

    uploadBox.addEventListener('click', () => hiddenFileInput.click());
    hiddenFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.processFile(file);
      }
      hiddenFileInput.value = '';
    });

    this.cropContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.cropContainer.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.cropContainer.addEventListener('mouseup', () => this.handleMouseUp());
    this.cropContainer.addEventListener('mouseleave', () => this.handleMouseUp());

    this.cropContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.cropContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.cropContainer.addEventListener('touchend', () => this.handleTouchEnd());

    this.cropContainer.addEventListener('wheel', (e) => this.handleWheel(e));

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('active')) {
        this.close();
      }
    });
  }

  open() {
    this.showSelectionScreen();
    this.renderRecentAvatars();
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  showSelectionScreen() {
    document.getElementById('modalTitle').textContent = 'Selecione uma imagem';
    this.selectionScreen.style.display = 'flex';
    this.editorScreen.classList.remove('active');
    document.getElementById('modalFooter').style.display = 'none';
  }

  showEditorScreen() {
    document.getElementById('modalTitle').textContent = 'Mover e redimensionar';
    this.selectionScreen.style.display = 'none';
    this.editorScreen.classList.add('active');
    document.getElementById('modalFooter').style.display = 'flex';
  }

  renderRecentAvatars() {
    const section = document.getElementById('recentAvatarsSection');
    const grid = document.getElementById('recentAvatarsGrid');

    if (this.recentAvatars.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    grid.innerHTML = '';

    this.recentAvatars.forEach((avatar, index) => {
      const avatarEl = document.createElement('div');
      avatarEl.className = 'recent-avatar';
      avatarEl.innerHTML = `<img src="${avatar}" alt="Avatar recente ${index + 1}">`;
      avatarEl.addEventListener('click', () => this.selectRecentAvatar(avatar));
      grid.appendChild(avatarEl);
    });
  }

  selectRecentAvatar(imageData) {
    const img = new Image();
    img.onload = () => {
      this.currentImage = img;
      this.cropImage.src = imageData;
      this.showEditorScreen();
      this.resetPosition();
    };
    img.src = imageData;
  }

  processFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      this.showError('Formato de imagem inválido. Use JPG, PNG ou WebP.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.showError('Arquivo muito grande. Tamanho máximo: 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.currentImage = new Image();
      this.currentImage.onload = () => {
        this.cropImage.src = e.target.result;
        this.showEditorScreen();
        this.resetPosition();
      };
      this.currentImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  close() {
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
    this.currentImage = null;
  }

  handleCancel() {
    if (this.editorScreen.classList.contains('active')) {
      this.showSelectionScreen();
    } else {
      this.close();
    }
  }

  getCropAreaSize() {
    const rect = this.cropContainer.getBoundingClientRect();
    return {
      width: rect.width || 300,
      height: rect.height || 300
    };
  }

  clampOffsets() {
    if (!this.currentImage) return;

    const { width: cropAreaWidth, height: cropAreaHeight } = this.getCropAreaSize();
    const scaledImgWidth = this.currentImage.width * this.zoom;
    const scaledImgHeight = this.currentImage.height * this.zoom;

    if (scaledImgWidth <= cropAreaWidth) {
      this.offsetX = (cropAreaWidth - scaledImgWidth) / 2;
    } else {
      const minOffsetX = cropAreaWidth - scaledImgWidth;
      this.offsetX = Math.max(minOffsetX, Math.min(0, this.offsetX));
    }

    if (scaledImgHeight <= cropAreaHeight) {
      this.offsetY = (cropAreaHeight - scaledImgHeight) / 2;
    } else {
      const minOffsetY = cropAreaHeight - scaledImgHeight;
      this.offsetY = Math.max(minOffsetY, Math.min(0, this.offsetY));
    }
  }

  resetPosition() {
    const { width: cropAreaWidth, height: cropAreaHeight } = this.getCropAreaSize();
    const imgWidth = this.currentImage.width;
    const imgHeight = this.currentImage.height;

    this.minZoom = Math.max(cropAreaWidth / imgWidth, cropAreaHeight / imgHeight);
    this.maxZoom = Math.min(Math.max(this.minZoom * 4, this.minZoom + 2), 8);
    this.zoom = this.minZoom;

    this.offsetX = (cropAreaWidth - (imgWidth * this.zoom)) / 2;
    this.offsetY = (cropAreaHeight - (imgHeight * this.zoom)) / 2;
    this.clampOffsets();

    const slider = document.getElementById('zoomSlider');
    slider.min = Math.round(this.minZoom * 100);
    slider.max = this.maxZoom * 100;
    slider.value = this.zoom * 100;
    this.updateImageTransform();
  }

  updateImageTransform() {
    this.clampOffsets();
    this.cropImage.style.transformOrigin = 'top left';
    this.cropImage.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
  }

  handleMouseDown(e) {
    this.isDragging = true;
    this.startX = e.clientX - this.offsetX;
    this.startY = e.clientY - this.offsetY;
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    this.offsetX = e.clientX - this.startX;
    this.offsetY = e.clientY - this.startY;
    this.updateImageTransform();
  }

  handleMouseUp() {
    this.isDragging = false;
  }

  handleTouchStart(e) {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.startX = e.touches[0].clientX - this.offsetX;
      this.startY = e.touches[0].clientY - this.offsetY;
    } else if (e.touches.length === 2) {
      this.isDragging = false;
      this.startPinchDistance = this.getPinchDistance(e.touches);
    }
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDragging) {
      this.offsetX = e.touches[0].clientX - this.startX;
      this.offsetY = e.touches[0].clientY - this.startY;
      this.updateImageTransform();
    } else if (e.touches.length === 2) {
      const currentDistance = this.getPinchDistance(e.touches);
      const scale = currentDistance / this.startPinchDistance;
      const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * scale));
      this.zoom = newZoom;
      document.getElementById('zoomSlider').value = this.zoom * 100;
      this.startPinchDistance = currentDistance;
      this.updateImageTransform();
    }
  }

  handleTouchEnd() {
    this.isDragging = false;
  }

  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));
    document.getElementById('zoomSlider').value = this.zoom * 100;
    this.updateImageTransform();
  }

  getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  save() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 512; // Discord recommended 512x512
    const { width: cropAreaWidth, height: cropAreaHeight } = this.getCropAreaSize();
    const scaleX = size / cropAreaWidth;
    const scaleY = size / cropAreaHeight;

    canvas.width = size;
    canvas.height = size;

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const imgWidth = this.currentImage.width * this.zoom * scaleX;
    const imgHeight = this.currentImage.height * this.zoom * scaleY;
    const x = this.offsetX * scaleX;
    const y = this.offsetY * scaleY;

    ctx.drawImage(this.currentImage, x, y, imgWidth, imgHeight);

    const finalImage = canvas.toDataURL('image/png', 1.0);
    this.addToRecentAvatars(finalImage);
    this.updateProfilePhoto(finalImage);
    this.close();
  }

  async updateProfilePhoto(imageData) {
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    if (!currentUser) return;

    currentUser.profilePhoto = imageData;
    sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));

    if (typeof updateUIWithUserData === 'function') {
      updateUIWithUserData(currentUser);
    }

    if (typeof syncAllAvatars === 'function') {
      syncAllAvatars(currentUser);
    }

    try {
      await updateUserByEmail(currentUser.email, { profilePhoto: imageData });
    } catch (error) {
      console.error('Erro ao salvar foto no banco de dados:', error);
    }
  }

  showError(message) {
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();

    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    document.body.appendChild(errorEl);

    setTimeout(() => {
      errorEl.remove();
    }, 3000);
  }
}

let profilePhotoEditor;

document.addEventListener('DOMContentLoaded', () => {
  profilePhotoEditor = new ProfilePhotoEditor();

  const photoInput = document.getElementById('profile-photo-input');
  if (photoInput) {
    // Remove default change listener and open modal directly
    photoInput.replaceWith(photoInput.cloneNode(true));
  }
});

// Override openConfigSection to open our modal
const originalOpenConfigSection = window.openConfigSection;
window.openConfigSection = function(sectionKey) {
  if (sectionKey === 'foto-de-perfil') {
    if (profilePhotoEditor) {
      profilePhotoEditor.open();
    }
  } else {
    if (originalOpenConfigSection) {
      originalOpenConfigSection(sectionKey);
    } else {
      alert(`Funcionalidade ainda não implementada: ${sectionKey.replace(/-/g, ' ')}`);
    }
  }
};
