
const { Audio } = require('expo-audio');

// Test if Audio module is properly imported
console.log('Audio module:', typeof Audio);
console.log('requestRecordingPermissionsAsync:', typeof Audio.requestRecordingPermissionsAsync);
console.log('setAudioModeAsync:', typeof Audio.setAudioModeAsync);
console.log('Recording:', typeof Audio.Recording);
console.log('RecordingOptionsPresets:', Audio.RecordingOptionsPresets);
