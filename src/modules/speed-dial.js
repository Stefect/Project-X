// ============================================
// SPEED DIAL MODULE - Модуль швидкого доступу
// ============================================

// Палітра кольорів з градієнтами для карток
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
let selectedColor = availableColors[4].class; // Дефолтний колір (indigo)

let speedDialContainer;
let modal;
let modalTitle;
let colorPickerContainer;
let linkTitleInput;
let linkUrlInput;
let linkIconInput;
let cancelModalBtn;
let saveLinkBtn;

// Ініціалізація модуля
function initSpeedDial() {
  speedDialContainer = document.getElementById('speed-dial');
  modal = document.getElementById('edit-modal');
  modalTitle = document.getElementById('modal-title');
  colorPickerContainer = document.getElementById('color-picker');
  linkTitleInput = document.getElementById('link-title');
  linkUrlInput = document.getElementById('link-url');
  linkIconInput = document.getElementById('link-icon');
  cancelModalBtn = document.getElementById('cancel-modal-btn');
  saveLinkBtn = document.getElementById('save-link-btn');

  if (!speedDialContainer || !modal) {
    console.error('[Speed Dial] Required elements not found');
    return;
  }

  // Підключаємо обробники подій
  if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', closeModal);
  }
  
  if (saveLinkBtn) {
    saveLinkBtn.addEventListener('click', saveLink);
  }

  // Закриття модального вікна по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
    // Збереження по Enter (якщо фокус в модальному вікні)
    if (e.key === 'Enter' && !modal.classList.contains('hidden')) {
      e.preventDefault();
      saveLink();
    }
  });

  // Закриття по кліку поза модальним вікном
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Автоматична генерація іконки з першої літери назви
  linkTitleInput.addEventListener('input', (e) => {
    if (!linkIconInput.value && e.target.value) {
      linkIconInput.value = e.target.value.charAt(0).toUpperCase();
    }
  });

  // Валідація URL при введенні
  linkUrlInput.addEventListener('blur', validateAndFormatUrl);

  renderSpeedDial();
  
  console.log('[Speed Dial] Initialized with', savedLinks.length, 'bookmarks');
}

// Валідація та форматування URL
function validateAndFormatUrl() {
  let url = linkUrlInput.value.trim();
  
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
    linkUrlInput.value = url;
  }
  
  // Простий візуальний індикатор валідності
  try {
    new URL(url);
    linkUrlInput.style.borderColor = '#10b981'; // зелений
  } catch {
    if (url) {
      linkUrlInput.style.borderColor = '#ef4444'; // червоний
    }
  }
}

// Отримання favicon з URL
function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
}

// 1. Рендер карток
function renderSpeedDial() {
  if (!speedDialContainer) return;
  
  speedDialContainer.innerHTML = '';

  savedLinks.forEach((link, index) => {
    const card = document.createElement('div');
    card.className = `${link.bgColor} gx-card h-32 flex flex-col items-center justify-center text-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-pointer relative group overflow-hidden`;
    
    // Фон з легкою текстурою
    card.style.position = 'relative';
    
    const faviconUrl = getFaviconUrl(link.url);
    const iconHtml = faviconUrl && !link.icon.match(/[\u{1F300}-\u{1F9FF}]/u) 
      ? `<img src="${faviconUrl}" class="w-12 h-12 mb-2 drop-shadow-lg rounded-full bg-white/10 p-2" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
         <div class="text-4xl mb-2 drop-shadow-lg" style="display:none;">${escapeHtml(link.icon || '🌐')}</div>`
      : `<div class="text-4xl mb-2 drop-shadow-lg">${escapeHtml(link.icon || '🌐')}</div>`;
    
    card.innerHTML = `
      <a href="${escapeHtml(link.url)}" class="absolute inset-0 flex flex-col items-center justify-center z-10 p-4">
        ${iconHtml}
        <span class="font-bold text-sm tracking-wide drop-shadow-md text-center">${escapeHtml(link.title)}</span>
      </a>
      
      <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button class="edit-link-btn p-1.5 bg-black/40 hover:bg-black/70 rounded-md text-xs text-white backdrop-blur-sm" data-index="${index}" title="Редагувати">✏️</button>
        <button class="delete-link-btn p-1.5 bg-black/40 hover:bg-red-500/80 rounded-md text-xs text-white backdrop-blur-sm" data-index="${index}" title="Видалити">🗑️</button>
      </div>
      
      <!-- Декоративний елемент -->
      <div class="absolute -bottom-2 -right-2 w-20 h-20 bg-white/5 rounded-full blur-2xl"></div>
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

  // Кнопка "+" для додавання нової закладки
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

// 2. Генерація кнопок вибору кольору в модалці
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

// 3. Відкриття модального вікна
function openModal(index) {
  currentEditingIndex = index;
  renderColorPicker();

  if (index !== null) {
    // Режим редагування
    modalTitle.textContent = 'Редагувати закладку';
    linkTitleInput.value = savedLinks[index].title;
    linkUrlInput.value = savedLinks[index].url;
    linkIconInput.value = savedLinks[index].icon || '';
    selectedColor = savedLinks[index].bgColor;
    renderColorPicker();
  } else {
    // Режим додавання (очищаємо поля)
    modalTitle.textContent = 'Додати закладку';
    linkTitleInput.value = '';
    linkUrlInput.value = '';
    linkIconInput.value = '';
    linkUrlInput.style.borderColor = ''; // скидаємо колір рамки
    selectedColor = availableColors[4].class;
  }

  modal.classList.remove('hidden');
  
  // Автофокус на перше поле з невеликою затримкою для анімації
  setTimeout(() => {
    linkTitleInput.focus();
  }, 100);
}

// 4. Закриття
function closeModal() {
  if (modal) {
    modal.classList.add('hidden');
    linkUrlInput.style.borderColor = ''; // скидаємо колір рамки
  }
}

// 5. Збереження
function saveLink() {
  const title = linkTitleInput.value.trim();
  let url = linkUrlInput.value.trim();
  const icon = linkIconInput.value.trim() || title.charAt(0).toUpperCase();

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

  // Автоматично додаємо https:// якщо потрібно
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Валідація URL
  try {
    new URL(url);
  } catch {
    linkUrlInput.style.borderColor = '#ef4444';
    linkUrlInput.focus();
    setTimeout(() => linkUrlInput.style.borderColor = '', 2000);
    return;
  }

  const newLink = { title, url, icon, bgColor: selectedColor };

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

// 6. Видалення
function deleteLink(index) {
  const link = savedLinks[index];
  
  // Створюємо власне модальне підтвердження (замість alert)
  const confirmation = confirm(`Видалити закладку "${link.title}"?`);
  
  if (confirmation) {
    savedLinks.splice(index, 1);
    localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
    renderSpeedDial();
    console.log('[Speed Dial] Bookmark deleted:', link.title);
  }
}

// Функція для безпечного відображення HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Експорт функції ініціалізації
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSpeedDial };
}

// Автоматична ініціалізація при завантаженні сторінки
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpeedDial);
} else {
  initSpeedDial();
}


// 1. Рендер карток
function renderSpeedDial() {
  if (!speedDialContainer) return;
  
  speedDialContainer.innerHTML = '';

  savedLinks.forEach((link, index) => {
    const card = document.createElement('div');
    // Робимо саму картку посиланням, але додаємо кнопки керування
    card.className = `${link.bgColor} gx-card h-32 flex flex-col items-center justify-center text-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-pointer relative group`;
    
    card.innerHTML = `
      <a href="${escapeHtml(link.url)}" class="absolute inset-0 flex flex-col items-center justify-center z-10">
        <div class="text-4xl mb-2 drop-shadow-lg">${escapeHtml(link.icon || '🌐')}</div>
        <span class="font-bold text-sm tracking-wide drop-shadow-md">${escapeHtml(link.title)}</span>
      </a>
      
      <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button class="edit-link-btn p-1 bg-black/40 hover:bg-black/70 rounded text-xs text-white" data-index="${index}" title="Редагувати">✏️</button>
        <button class="delete-link-btn p-1 bg-black/40 hover:bg-red-500/80 rounded text-xs text-white" data-index="${index}" title="Видалити">✖</button>
      </div>
    `;
    
    // Додаємо обробники для кнопок редагування та видалення
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

  // Кнопка "+"
  const addBtn = document.createElement('div');
  addBtn.className = 'bg-gray-800/60 hover:bg-gray-700 border-2 border-dashed border-gray-600 gx-card h-32 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200 cursor-pointer';
  addBtn.innerHTML = '<span class="text-5xl font-light">+</span>';
  addBtn.addEventListener('click', () => openModal(null));
  speedDialContainer.appendChild(addBtn);
}

// 2. Генерація кнопок вибору кольору в модалці
function renderColorPicker() {
  if (!colorPickerContainer) return;
  
  colorPickerContainer.innerHTML = '';
  availableColors.forEach(color => {
    const btn = document.createElement('button');
    btn.className = `w-8 h-8 rounded-full ${color} border-2 border-transparent color-btn cursor-pointer transition-transform`;
    if (color === selectedColor) btn.classList.add('ring-2', 'ring-white', 'border-gray-900');
    
    btn.addEventListener('click', () => {
      selectedColor = color;
      renderColorPicker(); // Перемальовуємо, щоб оновити обведення
    });
    
    colorPickerContainer.appendChild(btn);
  });
}

// 3. Відкриття модального вікна
function openModal(index) {
  currentEditingIndex = index;
  renderColorPicker();

  if (index !== null) {
    // Режим редагування
    modalTitle.textContent = 'Редагувати закладку';
    linkTitleInput.value = savedLinks[index].title;
    linkUrlInput.value = savedLinks[index].url;
    linkIconInput.value = savedLinks[index].icon;
    selectedColor = savedLinks[index].bgColor;
    renderColorPicker(); // Оновлюємо виділений колір
  } else {
    // Режим додавання (очищаємо поля)
    modalTitle.textContent = 'Додати закладку';
    linkTitleInput.value = '';
    linkUrlInput.value = '';
    linkIconInput.value = '';
    selectedColor = availableColors[4];
  }

  modal.classList.remove('hidden');
}

// 4. Закриття
function closeModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}

// 5. Збереження
function saveLink() {
  const title = linkTitleInput.value.trim();
  const url = linkUrlInput.value.trim();
  const icon = linkIconInput.value.trim() || '🌐';

  if (!title || !url) {
    alert('Будь ласка, заповніть назву та URL!');
    return;
  }

  const newLink = { title, url, icon, bgColor: selectedColor };

  if (currentEditingIndex !== null) {
    savedLinks[currentEditingIndex] = newLink; // Оновлюємо існуючу
  } else {
    savedLinks.push(newLink); // Додаємо нову
  }

  localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
  closeModal();
  renderSpeedDial();
  
  console.log('[Speed Dial] Link saved:', newLink);
}

// 6. Видалення
function deleteLink(index) {
  if (confirm('Точно видалити цю закладку?')) {
    const deletedLink = savedLinks[index];
    savedLinks.splice(index, 1);
    localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
    renderSpeedDial();
    console.log('[Speed Dial] Link deleted:', deletedLink);
  }
}

// Функція для безпечного відображення HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Експорт функції ініціалізації
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSpeedDial };
}

// Автоматична ініціалізація при завантаженні сторінки
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpeedDial);
} else {
  initSpeedDial();
}
