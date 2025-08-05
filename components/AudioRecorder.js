import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const AudioRecorder = () => {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSegments, setRecordingSegments] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [playingSegmentId, setPlayingSegmentId] = useState(null);
  const [soundObject, setSoundObject] = useState(null);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const segmentCountRef = useRef(0);
  const isRecordingRef = useRef(false);
  const recordingRef = useRef(null);

  useEffect(() => {
    // 컴포넌트 언마운트 시 정리 작업
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (soundObject) soundObject.unloadAsync();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
    };
  }, [soundObject]);

  // 녹음 세션을 시작하는 함수
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('권한 필요', '마이크 권한이 필요합니다.');
        return;
      }

      // 녹음 시작 시 오디오 모드 설정
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      setIsRecording(true);
      isRecordingRef.current = true;
      await startNewSegment();

      // 타이머 시작 (1초마다)
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
        setSegmentProgress(prev => (prev + 1) % 5);
      }, 1000);

      // 세그먼트 분할 타이머 시작 (5초마다)
      intervalRef.current = setInterval(() => {
        console.log('5 seconds interval triggered');
        handleSegmentSplit();
      }, 5000);

    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('녹음 오류', '녹음을 시작할 수 없습니다.');
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  // 녹음 세션을 완전히 중지하는 함수
  const stopRecording = async () => {
    setIsRecording(false); // isRecording 상태를 먼저 false로 설정
    isRecordingRef.current = false;

    // 모든 타이머 정리
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    intervalRef.current = null;
    timerRef.current = null;
    
    // UI 리셋
    setRecordingTime(0);
    setSegmentProgress(0);

    let finalSegments = [...recordingSegments];

    if (recording) {
      try {
        const savedSegment = await saveCurrentSegment();
        if (savedSegment) {
          finalSegments.push(savedSegment);
        }
        setRecordingSegments(finalSegments); // 최종 세그먼트 목록으로 업데이트
        setRecording(null);
      } catch (err) {
        console.error('Failed to save final segment', err);
      }
    }

    // 녹음 종료 후 오디오 모드 리셋 (선택적)
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
    
    Alert.alert('녹음 완료', `총 ${finalSegments.length}개의 파일이 저장되었습니다.`);
    segmentCountRef.current = 0; // 세그먼트 카운트 리셋
  };
  
  // 새로운 녹음 세그먼트를 시작하는 함수
  const startNewSegment = async () => {
    // 이미 녹음 객체가 있으면 반환
    if (recording || recordingRef.current) {
      console.log('Recording already in progress, skipping...');
      return;
    }
    
    try {
      // 새 세그먼트 시작 전에 오디오 모드 재설정 (녹음 허용)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      console.log('Starting new recording segment...');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      recordingRef.current = newRecording;
      console.log('New recording segment started successfully');
    } catch (err) {
      console.error('Failed to start new segment', err);
      Alert.alert('녹음 오류', '새로운 녹음 세그먼트를 시작할 수 없습니다.');
      stopRecording(); // 오류 발생 시 녹음 중지
    }
  };

  // 현재 세그먼트를 저장하는 로직 (중복 제거를 위해 분리)
  const saveCurrentSegment = async () => {
    if (!recording && !recordingRef.current) return null;

    try {
      console.log('Stopping and saving current segment...');
      // 현재 녹음 객체를 로컬 변수에 저장
      const currentRecording = recordingRef.current || recording;
      // 즉시 null로 설정하여 다른 함수에서 접근하지 못하도록 함
      setRecording(null);
      recordingRef.current = null;
      
      await currentRecording.stopAndUnloadAsync();
      
      // 녹음 중지 후 오디오 모드를 비활성화
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      
      const uri = currentRecording.getURI();

      if (!uri) {
          console.log("URI is null, skipping save.");
          return null;
      }

      const timestamp = new Date().getTime();
      const fileName = `recording_${segmentCountRef.current}_${timestamp}.m4a`;
      const newUri = FileSystem.documentDirectory + fileName;

      await FileSystem.moveAsync({ from: uri, to: newUri });
      console.log(`Segment ${segmentCountRef.current} saved to:`, newUri);

      const newSegment = {
        id: `segment_${segmentCountRef.current}_${timestamp}`,
        uri: newUri,
        fileName,
        timestamp,
      };

      segmentCountRef.current += 1;
      return newSegment;

    } catch (err) {
      console.error('Failed to save segment', err);
      return null;
    }
  };

  // 5초 간격으로 호출되어 세그먼트를 분할하는 함수
  const handleSegmentSplit = async () => {
    console.log('handleSegmentSplit called, isRecordingRef:', isRecordingRef.current);
    
    if (!isRecordingRef.current || (!recording && !recordingRef.current)) {
      console.log('Not recording or no recording object, skipping split');
      return;
    }
    
    const savedSegment = await saveCurrentSegment();
    if (savedSegment) {
      setRecordingSegments(prev => [...prev, savedSegment]);
    }
    // saveCurrentSegment에서 이미 recording을 null로 설정했으므로 제거
    setSegmentProgress(0);

    // 모드 전환 후 안정성을 위해 지연 추가
    await new Promise(resolve => setTimeout(resolve, 100));

    // isRecordingRef를 사용하여 여전히 녹음 중인지 확인
    if (isRecordingRef.current) {
      await startNewSegment();
    }
  };

  // 녹음/중지 버튼 핸들러
  const handleRecordButtonPress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const playSegment = async (segment) => {
    try {
      if (soundObject) {
        await soundObject.unloadAsync();
        setSoundObject(null);
        if (playingSegmentId === segment.id) {
          setPlayingSegmentId(null);
          return;
        }
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: segment.uri },
        { shouldPlay: true }
      );
      setSoundObject(sound);
      setPlayingSegmentId(segment.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingSegmentId(null);
          setSoundObject(null);
          sound.unloadAsync();
        }
      });
    } catch (err) {
      console.error('Failed to play audio', err);
      Alert.alert('재생 오류', '오디오를 재생할 수 없습니다.');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>5초 단위 음성 녹음기</Text>
      
      <TouchableOpacity
        style={[styles.button, isRecording && styles.recordingButton]}
        onPress={handleRecordButtonPress}
        testID="record-button"
      >
        <Text style={styles.buttonText}>
          {isRecording ? '녹음 중지' : '녹음 시작'}
        </Text>
      </TouchableOpacity>

      {isRecording && (
        <View style={styles.recordingInfo}>
          <Text style={styles.recordingText} testID="recording-indicator">
            녹음 중... (5초마다 자동 저장)
          </Text>
          <Text style={styles.timerText} testID="timer-display">
            {formatTime(recordingTime)}
          </Text>
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>다음 저장까지: {5 - segmentProgress}초</Text>
            <View style={styles.progressBar}>
              <View 
                style={[styles.progressFill, { width: `${(segmentProgress / 5) * 100}%` }]} 
                testID="progress-bar"
              />
            </View>
          </View>
        </View>
      )}

      <ScrollView style={styles.segmentList} contentContainerStyle={styles.segmentContent}>
        <Text style={styles.segmentTitle}>저장된 녹음 파일:</Text>
        <View testID="segments-list">
          {recordingSegments.map((segment, index) => (
            <TouchableOpacity 
              key={segment.id} 
              style={[
                styles.segmentItem,
                playingSegmentId === segment.id && styles.playingSegment
              ]} 
              onPress={() => playSegment(segment)}
              testID={`segment-${index}`}
            >
              <Text style={styles.segmentText}>
                {index + 1}. {segment.fileName}
              </Text>
              <Text style={styles.playText}>
                {playingSegmentId === segment.id ? '재생 중...' : '재생 ▶'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

// Styles (기존과 동일)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  recordingButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  recordingInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  recordingText: {
    fontSize: 16,
    color: '#FF3B30',
    marginBottom: 10,
  },
  timerText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  progressContainer: {
    width: 250,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  segmentList: {
    flex: 1,
    width: '100%',
    marginTop: 20,
  },
  segmentContent: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  segmentTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  segmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginVertical: 5,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  playingSegment: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  playText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
});

export default AudioRecorder;