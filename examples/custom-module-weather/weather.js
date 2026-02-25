// weather.js - Weather Widget Module for BrowserX
// Displays current weather in top-right corner of web pages

(function() {
  'use strict';

  // Prevent duplicate loading
  if (window._weatherEnabled) return;
  window._weatherEnabled = true;

  console.log('[Weather] Module initialized');

  // Configuration
  const CONFIG = {
    defaultCity: 'Kyiv',
    updateInterval: 30 * 60 * 1000, // 30 minutes
    position: { top: '60px', right: '20px' }
  };

  // Create weather widget element
  const widget = document.createElement('div');
  widget.id = 'weather-widget';
  widget.style.cssText = `
    position: fixed;
    top: ${CONFIG.position.top};
    right: ${CONFIG.position.right};
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 15px;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    min-width: 200px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  // Hover effect
  widget.addEventListener('mouseenter', () => {
    widget.style.transform = 'scale(1.05)';
    widget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
  });
  
  widget.addEventListener('mouseleave', () => {
    widget.style.transform = 'scale(1)';
    widget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
  });
  
  document.body.appendChild(widget);

  // Fetch weather data from wttr.in API
  async function fetchWeather(city = CONFIG.defaultCity) {
    try {
      widget.innerHTML = '<div>Loading...</div>';
      
      const response = await fetch(`https://wttr.in/${city}?format=j1`, {
        headers: { 'User-Agent': 'BrowserX-Weather/1.0' }
      });
      
      if (!response.ok) throw new Error('API request failed');
      
      const data = await response.json();
      const current = data.current_condition[0];
      const location = data.nearest_area[0];
      
      // Display weather info
      widget.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 16px;">
          📍 ${location.areaName[0].value}
        </div>
        <div style="font-size: 24px; margin: 10px 0;">
          ${current.temp_C}°C
        </div>
        <div style="color: #555; margin-bottom: 8px;">
          ${current.weatherDesc[0].value}
        </div>
        <div style="font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 8px;">
          💧 Humidity: ${current.humidity}% <br>
          💨 Wind: ${current.windspeedKmph} km/h
        </div>
        <div style="font-size: 10px; color: #999; margin-top: 8px; text-align: center;">
          Click to change city
        </div>
      `;
      
      // Save last city to localStorage
      localStorage.setItem('weatherCity', city);
      
    } catch (error) {
      console.error('[Weather] Error:', error);
      widget.innerHTML = `
        <div style="color: #e53e3e;">
          ❌ Weather unavailable
        </div>
        <div style="font-size: 12px; color: #666; margin-top: 5px;">
          Click to retry
        </div>
      `;
    }
  }

  // Change city on click
  widget.addEventListener('click', () => {
    const currentCity = localStorage.getItem('weatherCity') || CONFIG.defaultCity;
    const newCity = prompt('Enter city name:', currentCity);
    
    if (newCity && newCity.trim()) {
      fetchWeather(newCity.trim());
    }
  });

  // Initialize with saved city or default
  const savedCity = localStorage.getItem('weatherCity') || CONFIG.defaultCity;
  fetchWeather(savedCity);

  // Auto-update weather
  const updateTimer = setInterval(() => {
    const city = localStorage.getItem('weatherCity') || CONFIG.defaultCity;
    fetchWeather(city);
  }, CONFIG.updateInterval);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(updateTimer);
  });

})();
