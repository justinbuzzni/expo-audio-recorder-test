import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import AudioRecorder from '../components/AudioRecorder';

// Mock the modules
jest.mock('expo-av');
jest.mock('expo-file-system');
jest.spyOn(Alert, 'alert');

describe('AudioRecorder', () => {
  let mockRecording;
  let mockSound;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock recording
    mockRecording = {
      stopAndUnloadAsync: jest.fn(),
      getURI: jest.fn().mockReturnValue('mock://recording.m4a'),
    };

    // Mock sound
    mockSound = {
      unloadAsync: jest.fn(),
      setOnPlaybackStatusUpdate: jest.fn(),
    };

    // Setup default mocks
    Audio.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Audio.setAudioModeAsync.mockResolvedValue();
    Audio.Recording.createAsync.mockResolvedValue({ recording: mockRecording });
    Audio.Sound.createAsync.mockResolvedValue({ sound: mockSound });
    FileSystem.moveAsync.mockResolvedValue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders correctly', () => {
    const { getByText, getByTestId } = render(<AudioRecorder />);
    
    expect(getByText('5초 단위 음성 녹음기')).toBeTruthy();
    expect(getByTestId('record-button')).toBeTruthy();
    expect(getByText('녹음 시작')).toBeTruthy();
  });

  it('requests permissions before recording', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('shows alert when permission is denied', async () => {
    Audio.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    expect(Alert.alert).toHaveBeenCalledWith('권한 필요', '마이크 권한이 필요합니다.');
  });

  it('starts recording when button is pressed', async () => {
    const { getByTestId, getByText } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    await waitFor(() => {
      expect(getByText('녹음 중지')).toBeTruthy();
      expect(getByTestId('recording-indicator')).toBeTruthy();
      expect(Audio.Recording.createAsync).toHaveBeenCalled();
    });
  });

  it('displays timer during recording', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    await waitFor(() => {
      expect(getByTestId('timer-display')).toBeTruthy();
      expect(getByTestId('timer-display').props.children).toBe('00:00');
    });

    // Advance timer by 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(getByTestId('timer-display').props.children).toBe('00:05');
    });
  });

  it('shows progress bar for 5-second segments', async () => {
    const { getByTestId, getByText } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    await waitFor(() => {
      expect(getByTestId('progress-bar')).toBeTruthy();
      expect(getByText('다음 저장까지: 5초')).toBeTruthy();
    });

    // Advance timer by 3 seconds
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(getByText('다음 저장까지: 2초')).toBeTruthy();
    });
  });

  it('saves segments every 5 seconds', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    // Advance timer by 5 seconds to trigger segment save
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
      expect(FileSystem.moveAsync).toHaveBeenCalled();
    });
  });

  it('stops recording when stop button is pressed', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    // Start recording
    await act(async () => {
      fireEvent.press(recordButton);
    });

    // Stop recording
    await act(async () => {
      fireEvent.press(recordButton);
    });

    await waitFor(() => {
      expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        '녹음 완료',
        expect.stringContaining('개의 파일이 저장되었습니다')
      );
    });
  });

  it('displays saved segments with unique keys', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    // Advance timer to create multiple segments
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      const segmentsList = getByTestId('segments-list');
      const segments = segmentsList.props.children;
      
      // Check that segments have unique keys
      if (Array.isArray(segments)) {
        const keys = segments.map(segment => segment.key);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size);
      }
    });
  });

  it('plays audio when segment is pressed', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    // Record and create a segment
    await act(async () => {
      fireEvent.press(recordButton);
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await act(async () => {
      fireEvent.press(recordButton);
    });

    // Find and press the first segment
    await waitFor(() => {
      const firstSegment = getByTestId('segment-0');
      fireEvent.press(firstSegment);
    });

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalled();
      expect(mockSound.setOnPlaybackStatusUpdate).toHaveBeenCalled();
    });
  });

  it('stops playing when the same segment is pressed again', async () => {
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    // Record and create a segment
    await act(async () => {
      fireEvent.press(recordButton);
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await act(async () => {
      fireEvent.press(recordButton);
    });

    // Press segment to play
    await waitFor(() => {
      const firstSegment = getByTestId('segment-0');
      fireEvent.press(firstSegment);
    });

    // Press same segment again to stop
    await waitFor(() => {
      const firstSegment = getByTestId('segment-0');
      fireEvent.press(firstSegment);
    });

    expect(mockSound.unloadAsync).toHaveBeenCalled();
  });

  it('handles recording errors gracefully', async () => {
    Audio.Recording.createAsync.mockRejectedValue(new Error('Recording failed'));
    
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    await act(async () => {
      fireEvent.press(recordButton);
    });

    expect(Alert.alert).toHaveBeenCalledWith('녹음 오류', '녹음을 시작할 수 없습니다.');
  });

  it('handles playback errors gracefully', async () => {
    Audio.Sound.createAsync.mockRejectedValue(new Error('Playback failed'));
    
    const { getByTestId } = render(<AudioRecorder />);
    const recordButton = getByTestId('record-button');

    // Record and create a segment
    await act(async () => {
      fireEvent.press(recordButton);
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await act(async () => {
      fireEvent.press(recordButton);
    });

    // Try to play segment
    await waitFor(() => {
      const firstSegment = getByTestId('segment-0');
      fireEvent.press(firstSegment);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('재생 오류', '오디오를 재생할 수 없습니다.');
    });
  });
});