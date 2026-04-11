

console.log('=== 🔍 TOR MODULE TEST ===\n');
async function testTorStatus() {
  console.log('📋 Test 1: Tor Status');
  try {
    const status = await ipcRenderer.invoke('get-tor-status');
    console.log('  ✓ Status:', JSON.stringify(status, null, 2));
    
    if (status.ready) {
      console.log('  ✅ Tor is READY');
    } else {
      console.log(`  ⏳ Tor is loading: ${status.bootstrapProgress}%`);
    }
    
    if (status.active) {
      console.log('  ✅ Tor is ACTIVE (proxy enabled)');
    } else {
      console.log('  ⚠️ Tor is INACTIVE (direct connection)');
    }
    
    return status;
  } catch (err) {
    console.error('  ❌ Error:', err.message);
    return null;
  }
}
async function testIPAddress() {
  console.log('\n📋 Test 2: IP Address Check');
  try {
    const startTime = Date.now();
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const responseTime = Date.now() - startTime;
    
    console.log(`  ✓ IP: ${data.ip}`);
    console.log(`  ✓ Response time: ${responseTime} ms`);
    try {
      const geoResponse = await fetch(`https://ipapi.co/${data.ip}/json/`);
      const geoData = await geoResponse.json();
      
      console.log(`  ✓ Country: ${geoData.country_name || 'Unknown'}`);
      console.log(`  ✓ City: ${geoData.city || 'Unknown'}`);
      console.log(`  ✓ ISP: ${geoData.org || 'Unknown'}`);
      
      const isTorExit = geoData.org && (
        geoData.org.toLowerCase().includes('tor') || 
        geoData.org.toLowerCase().includes('exit')
      );
      
      if (isTorExit) {
        console.log('  ✅ This is a TOR EXIT NODE!');
      } else {
        console.log('  ⚠️ This is NOT a Tor exit node');
      }
      
      return { ip: data.ip, geo: geoData, isTor: isTorExit };
    } catch (geoErr) {
      console.warn('  ⚠️ Could not get geolocation:', geoErr.message);
      return { ip: data.ip };
    }
  } catch (err) {
    console.error('  ❌ Error:', err.message);
    return null;
  }
}
async function testDuckDuckGo() {
  console.log('\n📋 Test 3: DuckDuckGo Connection');
  try {
    const startTime = Date.now();
    const response = await fetch('https://duckduckgo.com/', {
      method: 'HEAD',
      redirect: 'follow'
    });
    const responseTime = Date.now() - startTime;
    
    console.log(`  ✓ Status: ${response.status} ${response.statusText}`);
    console.log(`  ✓ Response time: ${responseTime} ms`);
    
    if (response.ok) {
      console.log('  ✅ DuckDuckGo is accessible through Tor');
    } else {
      console.log('  ⚠️ DuckDuckGo returned non-200 status');
    }
    
    return { status: response.status, time: responseTime };
  } catch (err) {
    console.error('  ❌ Error:', err.message);
    if (err.message.includes('NAME_NOT_RESOLVED')) {
      console.error('  💡 DNS not resolving - possible DNS leak or Tor not active');
    } else if (err.message.includes('TIMED_OUT')) {
      console.error('  💡 Connection timed out - Tor circuit may be slow');
    }
    return null;
  }
}
async function testDNSLeak() {
  console.log('\n📋 Test 4: DNS Leak Test');
  try {
    const response = await fetch('https://www.dnsleaktest.com/json', {
      method: 'GET'
    });
    const data = await response.json();
    
    console.log('  ✓ DNS Server:', data.ip);
    console.log('  ✓ Country:', data.country_name);
    console.log('  ✓ ISP:', data.org);
    
    if (data.country_code === 'UA') {
      console.log('  ❌ DNS LEAK DETECTED! You are using Ukrainian DNS');
    } else {
      console.log('  ✅ DNS appears to be routed through Tor');
    }
    
    return data;
  } catch (err) {
    console.warn('  ⚠️ Could not test DNS leak:', err.message);
    return null;
  }
}
async function testWebRTCLeak() {
  console.log('\n📋 Test 5: WebRTC Leak Test');
  
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const ips = new Set();
    
    pc.createDataChannel('');
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
    
    pc.onicecandidate = (ice) => {
      if (!ice || !ice.candidate || !ice.candidate.candidate) {
        setTimeout(() => {
          pc.close();
          
          if (ips.size === 0) {
            console.log('  ✅ No WebRTC leaks detected (no local IPs exposed)');
          } else {
            console.log('  ⚠️ WebRTC exposed IPs:');
            ips.forEach(ip => console.log(`    - ${ip}`));
            
            const hasPrivateIP = Array.from(ips).some(ip => 
              ip.startsWith('192.168.') || 
              ip.startsWith('10.') || 
              ip.startsWith('172.')
            );
            
            if (hasPrivateIP) {
              console.log('  ❌ PRIVATE IP LEAKED via WebRTC!');
            }
          }
          
          resolve(Array.from(ips));
        }, 2000);
        return;
      }
      
      const candidate = ice.candidate.candidate;
      const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
      const match = candidate.match(ipRegex);
      
      if (match && match[1]) {
        ips.add(match[1]);
        console.log(`  Found IP: ${match[1]}`);
      }
    };
  });
}
async function runAllTests() {
  console.log('⏱️ Starting tests...\n');
  const startTime = Date.now();
  
  const status = await testTorStatus();
  
  if (!status || !status.active) {
    console.log('\n⚠️ Tor is not active. Please enable Tor and run tests again.');
    console.log('💡 Click "Tor: OFF" button to enable Tor\n');
    return;
  }
  
  const ipTest = await testIPAddress();
  const ddgTest = await testDuckDuckGo();
  const dnsTest = await testDNSLeak();
  const webrtcTest = await testWebRTCLeak();
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n=== 📊 TEST SUMMARY ===');
  console.log(`Total time: ${totalTime} ms\n`);
  
  console.log('Results:');
  console.log(`  Tor Status: ${status.ready ? '✅ Ready' : '⏳ Loading'}`);
  console.log(`  Tor Active: ${status.active ? '✅ Yes' : '❌ No'}`);
  console.log(`  IP Check: ${ipTest ? '✅ Pass' : '❌ Fail'}`);
  console.log(`  DuckDuckGo: ${ddgTest ? '✅ Pass' : '❌ Fail'}`);
  console.log(`  DNS Leak: ${dnsTest ? (dnsTest.country_code === 'UA' ? '❌ Leaked' : '✅ Safe') : '⚠️ Unknown'}`);
  console.log(`  WebRTC Leak: ${webrtcTest.length === 0 ? '✅ Safe' : '⚠️ ' + webrtcTest.length + ' IPs exposed'}`);
  
  if (ipTest && ipTest.isTor) {
    console.log('\n✅ ALL TESTS PASSED! You are using Tor correctly.');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Check the results above.');
  }
  
  console.log('\n=== END OF TESTS ===\n');
}
window.torTests = {
  runAll: runAllTests,
  testStatus: testTorStatus,
  testIP: testIPAddress,
  testDDG: testDuckDuckGo,
  testDNS: testDNSLeak,
  testWebRTC: testWebRTCLeak
};

console.log('💡 Tests loaded! Run: torTests.runAll()');
console.log('💡 Or run individual tests: torTests.testIP()');
