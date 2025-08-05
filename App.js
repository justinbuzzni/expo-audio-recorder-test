import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AudioRecorder from './components/AudioRecorder';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <AudioRecorder />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});