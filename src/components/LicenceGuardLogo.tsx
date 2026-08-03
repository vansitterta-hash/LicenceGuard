import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '../theme/colors';

const primaryLogo = require('../../assets/licenceguard-logo-primary.png');

type Props = {
  variant?: 'primary' | 'compact';
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

export default function LicenceGuardLogo({ variant = 'primary', width = '100%', style, imageStyle }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showCompactFallback = variant === 'compact' || imageFailed;

  return (
    <View
      accessibilityLabel="LicenceGuard logo"
      accessibilityRole="image"
      style={[styles.container, variant === 'compact' ? styles.compactContainer : styles.primaryContainer, { width }, style]}
    >
      {showCompactFallback ? (
        <View style={styles.compactMark}>
          <Text style={styles.compactText}>LG</Text>
        </View>
      ) : (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setImageFailed(true)}
          resizeMode="contain"
          source={primaryLogo}
          style={[styles.primaryImage, imageStyle]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  primaryContainer: { aspectRatio: 1229 / 1536 },
  primaryImage: { height: '100%', width: '100%' },
  compactContainer: { aspectRatio: 1 },
  compactMark: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.primary,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    width: '100%',
  },
  compactText: { color: Colors.white, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
});
