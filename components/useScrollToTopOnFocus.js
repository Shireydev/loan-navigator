import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { subscribeToTabScrollRequest } from './tabScrollCoordinator';

// Keep screen state intact while ensuring a screen begins at the top whenever
// it becomes the active destination (including a bottom-tab change).
export default function useScrollToTopOnFocus(scrollRef, onReset, tabName) {
  const navigation = useNavigation();
  const resetRef = useRef(onReset);
  resetRef.current = onReset;

  const scrollToTop = useCallback(() => {
    if (typeof scrollRef.current?.scrollToOffset === 'function') {
      scrollRef.current.scrollToOffset({ offset: 0, animated: false });
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    resetRef.current?.();
  }, [scrollRef]);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(scrollToTop);
    }, [scrollToTop]),
  );

  useEffect(
    () =>
      subscribeToTabScrollRequest((destination) => {
        if (destination === tabName && navigation.isFocused()) scrollToTop();
      }),
    [navigation, scrollToTop, tabName],
  );
}
