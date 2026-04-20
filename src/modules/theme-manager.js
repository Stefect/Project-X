let themeSettings = {
  mode: 'dark',
  bg: '#1a1b26',
  accent: '#3b82f6',
  wallpaper: 'none'
};


function updateThemeSettings(settings) {
  themeSettings = { ...themeSettings, ...settings };
  console.log('[THEME] Settings updated:', themeSettings);
  return themeSettings;
}


function getThemeSettings() {
  return { ...themeSettings };
}


function injectThemeToNewtab(browserView) {
  const script = `
    (function() {
      const settings = ${JSON.stringify(themeSettings)};
      document.body.classList.remove('light-mode', 'dark-mode');
      if (settings.mode === 'light') {
        document.body.classList.add('light-mode');
      } else {
        document.body.classList.add('dark-mode');
      }
      document.documentElement.style.setProperty('--accent-color', settings.accent);
      if (settings.bg) {
        document.body.style.backgroundColor = settings.bg;
      }
      if (settings.wallpaper && settings.wallpaper !== 'none') {
        const wallpaperGradients = {
          'abstract1': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          'abstract2': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          'abstract3': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          'abstract4': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
          'abstract5': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          'abstract6': 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'
        };
        
        if (settings.wallpaper.startsWith('data:') || settings.wallpaper.startsWith('http')) {
          document.body.style.backgroundImage = 'url(' + settings.wallpaper + ')';
        } else if (wallpaperGradients[settings.wallpaper]) {
          document.body.style.backgroundImage = wallpaperGradients[settings.wallpaper];
        }
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
      } else {
        document.body.style.backgroundImage = 'none';
      }
      
      console.log('Theme applied to newtab:', settings);
    })();
  `;
  
  browserView.webContents.executeJavaScript(script).catch(err => {
    console.log('[THEME] Injection error:', err.message);
  });
}


function injectLightTheme(targetView) {
  const lightThemeCSS = `
    html {
      filter: invert(1) hue-rotate(180deg) !important;
      background-color: #ffffff !important;
    }
    
    img, picture, video, canvas, svg, iframe {
      filter: invert(1) hue-rotate(180deg) !important;
    }
    
    * {
      background-color: inherit !important;
      scrollbar-color: #888 #f1f1f1 !important;
    }
  `;
  
  targetView.webContents.insertCSS(lightThemeCSS)
    .then(() => {
      console.log('[THEME] Light theme activated');
    })
    .catch(err => {
      console.error('[THEME] Light theme injection error:', err);
    });
}

module.exports = {
  updateThemeSettings,
  injectThemeToNewtab
};
