/**
 * Тест блокування геолокації
 * Вставте цей код у DevTools Console вкладки (F12)
 * щоб перевірити чи працює блокування геолокації
 */

console.log('=== 🔒 GEOLOCATION BLOCK TEST ===\n');

// Тест 1: Перевірка доступності API
console.log('📋 Test 1: Geolocation API availability');
if (navigator.geolocation) {
  console.log('  ✓ navigator.geolocation exists');
} else {
  console.log('  ✗ navigator.geolocation is undefined');
}

// Тест 2: Спроба отримати поточну позицію
console.log('\n📋 Test 2: Attempt getCurrentPosition');
navigator.geolocation.getCurrentPosition(
  (position) => {
    console.error('  ❌ FAIL: Geolocation NOT blocked!');
    console.error('  Coordinates:', {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    });
    console.error('  ⚠️ WARNING: Your real location is exposed!');
  },
  (error) => {
    console.log('  ✅ SUCCESS: Geolocation blocked!');
    console.log('  Error code:', error.code);
    console.log('  Error message:', error.message);
    
    if (error.code === 1) {
      console.log('  ✓ PERMISSION_DENIED - Perfect!');
    } else if (error.code === 2) {
      console.log('  ⚠️ POSITION_UNAVAILABLE - API works but no location');
    } else if (error.code === 3) {
      console.log('  ⚠️ TIMEOUT - API works but timed out');
    }
  }
);

// Тест 3: Перевірка патчу
console.log('\n📋 Test 3: Check for privacy patch');
if (window.__geoLocationBlocked) {
  console.log('  ✅ Privacy Guard patch detected!');
} else {
  console.log('  ⚠️ No privacy patch marker found');
}

// Тест 4: Перевірка типу навігатора
console.log('\n📋 Test 4: Navigator geolocation type');
console.log('  Type:', typeof navigator.geolocation);
console.log('  Methods:', Object.keys(navigator.geolocation));

console.log('\n=== Test completed ===');
console.log('Expected result when Tor is ON:');
console.log('  - Error code: 1 (PERMISSION_DENIED)');
console.log('  - Message: "User denied Geolocation"');
console.log('  - Privacy patch detected: YES');
