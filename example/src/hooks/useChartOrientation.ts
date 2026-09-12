import { useCallback, useLayoutEffect, useState } from 'react';

type ChartOrientationNavigation = {
  setOptions: (options: { orientation: 'portrait_up' | 'landscape' }) => void;
};

export function useChartOrientation(navigation: ChartOrientationNavigation) {
  const [isLandscape, setIsLandscape] = useState(false);
  const toggleOrientation = useCallback(() => {
    setIsLandscape((current) => !current);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      orientation: isLandscape ? 'landscape' : 'portrait_up',
    });
  }, [isLandscape, navigation]);

  return { isLandscape, toggleOrientation };
}
