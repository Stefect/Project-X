# Custom Weather Widget Module

This example demonstrates how to create a custom module for BrowserX that displays weather information.

## Features

- Shows current weather for any city
- Updates every 30 minutes
- Click to change city
- Clean, modern UI

## Installation

1. Copy `weather.js` to `src/modules/weather.js`

2. Add to `src/main.js`:

```javascript
// Load weather module
const weatherModule = fs.readFileSync(
  path.join(__dirname, 'modules', 'weather.js'),
  'utf-8'
);

// Inject into all pages
view.webContents.on('did-finish-load', () => {
  view.webContents.executeJavaScript(weatherModule);
});
```

3. Restart BrowserX

## Usage

- Widget appears in top-right corner of all web pages
- Click widget to change city
- Weather updates automatically

## Customization

Edit `weather.js` to customize:
- Position: Change `top` and `right` values
- Update interval: Change `30 * 60 * 1000` (30 minutes)
- Styling: Modify `.style.cssText`
- API: Uses wttr.in (free, no key required)

## API Used

[wttr.in](https://wttr.in) - Free weather API

```javascript
// Example request
fetch('https://wttr.in/London?format=j1')
  .then(r => r.json())
  .then(data => console.log(data));
```

## Screenshot

```
┌─────────────────┐
│ Kyiv            │
│ 15°C - Sunny    │
│ Humidity: 45%   │
└─────────────────┘
```
