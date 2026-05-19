try {
  const androidtv = require('androidtv-remote');
  console.log('androidtv-remote loaded:', Object.keys(androidtv));
} catch (e) {
  console.error('Failed to load androidtv-remote:', e.message);
}

try {
  const adb = require('adbkit');
  const client = adb.createClient();
  console.log('adbkit client created');
} catch (e) {
  console.error('Failed to init adbkit:', e.message);
}
