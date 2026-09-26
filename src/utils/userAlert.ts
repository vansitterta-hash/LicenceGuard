import { Alert, Platform, type AlertButton } from 'react-native';

export const userAlert = {
  alert(title: string, message = '', buttons?: AlertButton[]) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      Alert.alert(title, message, buttons);
      return;
    }
    const action = buttons?.find((button) => button.style === 'destructive')
      ?? buttons?.find((button) => button.style !== 'cancel');
    if (buttons && buttons.length > 1) {
      if (window.confirm(`${title}\n\n${message}`)) action?.onPress?.();
    } else {
      window.alert(`${title}\n\n${message}`);
      action?.onPress?.();
    }
  },
};
