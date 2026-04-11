const availableColors = [
  { class: 'bg-gradient-to-br from-red-500 to-pink-600', name: 'red' },
  { class: 'bg-gradient-to-br from-orange-500 to-yellow-500', name: 'orange' },
  { class: 'bg-gradient-to-br from-green-500 to-emerald-600', name: 'green' },
  { class: 'bg-gradient-to-br from-blue-500 to-cyan-600', name: 'blue' },
  { class: 'bg-gradient-to-br from-indigo-500 to-purple-600', name: 'indigo' },
  { class: 'bg-gradient-to-br from-purple-500 to-pink-600', name: 'purple' },
  { class: 'bg-gradient-to-br from-gray-700 to-gray-900', name: 'dark' }
];

let savedLinks = JSON.parse(localStorage.getItem('projectX_speedDial')) || [];
let currentEditingIndex = null;
let selectedColor = availableColors[4].class;
let currentBannerUrl = null;

let speedDialContainer;
let modal;
let modalTitle;
let colorPickerContainer;
let linkTitleInput;
let linkUrlInput;
let cancelModalBtn;
let saveLinkBtn;
let fetchBannerBtn;
let bannerPreview;
let bannerPreviewImg;
function initSpeedDial() {
  speedDialContainer = document.getElementById('speed-dial');
  modal = document.getElementById('edit-modal');
  modalTitle = document.getElementById('modal-title');
  colorPickerContainer = document.getElementById('color-picker');
  linkTitleInput = document.getElementById('link-title');
  linkUrlInput = document.getElementById('link-url');
  cancelModalBtn = document.getElementById('cancel-modal-btn');
  saveLinkBtn = document.getElementById('save-link-btn');
  fetchBannerBtn = document.getElementById('fetch-banner-btn');
  bannerPreview = document.getElementById('banner-preview');
  bannerPreviewImg = document.getElementById('banner-preview-img');

  if (!speedDialContainer || !modal) {
    console.error('[Speed Dial] Required elements not found');
    return;
  }
  if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', closeModal);
  }
  
  if (saveLinkBtn) {
    saveLinkBtn.addEventListener('click', saveLink);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
    if (e.key === 'Enter' && !modal.classList.contains('hidden')) {
      e.preventDefault();
      saveLink();
    }
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  linkUrlInput.addEventListener('blur', validateAndFormatUrl);
  if (fetchBannerBtn) {
    fetchBannerBtn.addEventListener('click', fetchAndPreviewBanner);
  }

  renderSpeedDial();
  
  console.log('[Speed Dial] Initialized with', savedLinks.length, 'bookmarks');
}
function validateAndFormatUrl() {
  let url = linkUrlInput.value.trim();
  
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
    linkUrlInput.value = url;
  }
  try {
    new URL(url);
    linkUrlInput.style.borderColor = '#10b981';
  } catch {
    if (url) {
      linkUrlInput.style.borderColor = '#ef4444';
    }
  }
}
async function fetchBannerUrl(url) {
  try {
    const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    
    if (data.status === 'success' && data.data && data.data.image) {
      console.log('[Speed Dial] Found Open Graph image:', data.data.image.url);
      return data.data.image.url;
    }
    
    console.log('[Speed Dial] No Open Graph image found, using screenshot fallback');
    return `https://image.thum.io/get/width/400/crop/300/${url}`;
  } catch (error) {
    console.error('[Speed Dial] Error fetching banner:', error);
    return `https://image.thum.io/get/width/400/crop/300/${url}`;
  }
}
async function fetchAndPreviewBanner() {
  const url = linkUrlInput.value.trim();
  
  if (!url) {
    linkUrlInput.focus();
    linkUrlInput.style.borderColor = '#ef4444';
    setTimeout(() => linkUrlInput.style.borderColor = '', 2000);
    return;
  }
  fetchBannerBtn.disabled = true;
  fetchBannerBtn.innerHTML = `
    <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    Завантаження банеру...
  `;
  
  try {
    const bannerUrl = await fetchBannerUrl(url);
    
    if (bannerUrl) {
      currentBannerUrl = bannerUrl;
      bannerPreviewImg.src = bannerUrl;
      bannerPreview.classList.remove('hidden');
      bannerPreview.classList.add('block');
      
      console.log('[Speed Dial] Banner loaded:', bannerUrl);
    } else {
      alert('Не вдалось завантажити банер сайту.');
    }
  } catch (error) {
    console.error('[Speed Dial] Error fetching banner:', error);
    alert('Помилка завантаження банеру');
  } finally {
    fetchBannerBtn.disabled = false;
    fetchBannerBtn.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      Завантажити банер сайту
    `;
  }
}
function renderSpeedDial() {
  if (!speedDialContainer) return;
  
  speedDialContainer.innerHTML = '';

  savedLinks.forEach((link, index) => {
    const card = document.createElement('div');
    card.className = `gx-card h-32 flex flex-col items-center justify-end text-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-pointer relative group overflow-hidden`;
    if (link.bannerUrl) {
      card.style.backgroundImage = `url(${link.bannerUrl})`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
      card.style.backgroundColor = '#1f2937';
    } else {
      card.className += ` ${link.bgColor}`;
    }
    
    card.innerHTML = `
      <a href="${escapeHtml(link.url)}" class="absolute inset-0 z-10 group-hover:bg-black/20 transition-colors"></a>
      
      <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button class="edit-link-btn p-1.5 bg-black/70 hover:bg-black/90 rounded-md text-xs text-white backdrop-blur-sm" data-index="${index}" title="Редагувати">✏️</button>
        <button class="delete-link-btn p-1.5 bg-black/70 hover:bg-red-500/90 rounded-md text-xs text-white backdrop-blur-sm" data-index="${index}" title="Видалити">🗑️</button>
      </div>
    `;
    
    const editBtn = card.querySelector('.edit-link-btn');
    const deleteBtn = card.querySelector('.delete-link-btn');
    
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(index);
      });
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteLink(index);
      });
    }
    
    speedDialContainer.appendChild(card);
  });
  const addBtn = document.createElement('div');
  addBtn.className = 'bg-gray-800/40 hover:bg-gray-700/60 border-2 border-dashed border-gray-600/50 gx-card h-32 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-300 cursor-pointer backdrop-blur-sm';
  addBtn.innerHTML = `
    <div class="flex flex-col items-center gap-2">
      <span class="text-4xl font-light">+</span>
      <span class="text-xs font-medium">Додати закладку</span>
    </div>
  `;
  addBtn.addEventListener('click', () => openModal(null));
  speedDialContainer.appendChild(addBtn);
}
function renderColorPicker() {
  if (!colorPickerContainer) return;
  
  colorPickerContainer.innerHTML = '';
  availableColors.forEach(color => {
    const btn = document.createElement('button');
    btn.className = `w-10 h-10 rounded-lg ${color.class} border-2 border-transparent color-btn cursor-pointer transition-all shadow-md`;
    btn.title = color.name;
    
    if (color.class === selectedColor) {
      btn.classList.add('ring-2', 'ring-white', 'ring-offset-2', 'ring-offset-gray-800');
    }
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedColor = color.class;
      renderColorPicker();
    });
    
    colorPickerContainer.appendChild(btn);
  });
}
function openModal(index) {
  currentEditingIndex = index;
  currentBannerUrl = null;
  renderColorPicker();

  if (index !== null) {
    modalTitle.textContent = 'Редагувати закладку';
    linkTitleInput.value = savedLinks[index].title;
    linkUrlInput.value = savedLinks[index].url;
    selectedColor = savedLinks[index].bgColor;
    if (savedLinks[index].bannerUrl) {
      currentBannerUrl = savedLinks[index].bannerUrl;
      bannerPreviewImg.src = savedLinks[index].bannerUrl;
      bannerPreview.classList.remove('hidden');
      bannerPreview.classList.add('block');
    } else {
      bannerPreview.classList.add('hidden');
      bannerPreview.classList.remove('block');
    }
    
    renderColorPicker();
  } else {
    modalTitle.textContent = 'Додати закладку';
    linkTitleInput.value = '';
    linkUrlInput.value = '';
    linkUrlInput.style.borderColor = '';
    selectedColor = availableColors[4].class;
    bannerPreview.classList.add('hidden');
    bannerPreview.classList.remove('block');
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    linkTitleInput.focus();
  }, 100);
}
function closeModal() {
  if (modal) {
    modal.classList.add('hidden');
    if (linkUrlInput) linkUrlInput.style.borderColor = '';
    currentBannerUrl = null;
    if (bannerPreview) {
      bannerPreview.classList.add('hidden');
      bannerPreview.classList.remove('block');
    }
  }
}
function saveLink() {
  const title = linkTitleInput.value.trim();
  let url = linkUrlInput.value.trim();

  if (!title) {
    linkTitleInput.focus();
    linkTitleInput.style.borderColor = '#ef4444';
    setTimeout(() => linkTitleInput.style.borderColor = '', 2000);
    return;
  }

  if (!url) {
    linkUrlInput.focus();
    linkUrlInput.style.borderColor = '#ef4444';
    setTimeout(() => linkUrlInput.style.borderColor = '', 2000);
    return;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  try {
    new URL(url);
  } catch {
    linkUrlInput.style.borderColor = '#ef4444';
    linkUrlInput.focus();
    setTimeout(() => linkUrlInput.style.borderColor = '', 2000);
    return;
  }
  const newLink = { 
    title, 
    url, 
    bgColor: selectedColor,
    bannerUrl: currentBannerUrl
  };

  if (currentEditingIndex !== null) {
    savedLinks[currentEditingIndex] = newLink;
    console.log('[Speed Dial] Bookmark updated:', newLink);
  } else {
    savedLinks.push(newLink);
    console.log('[Speed Dial] Bookmark added:', newLink);
  }

  localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
  closeModal();
  renderSpeedDial();
}
function deleteLink(index) {
  const link = savedLinks[index];
  const confirmation = confirm(`Видалити закладку "${link.title}"?`);
  
  if (confirmation) {
    savedLinks.splice(index, 1);
    localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
    renderSpeedDial();
    console.log('[Speed Dial] Bookmark deleted:', link.title);
  }
}
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpeedDial);
} else {
  initSpeedDial();
}
