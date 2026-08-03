import { Linking, Platform } from 'react-native';

type ExternalDocumentContext = {
  applicationCaseId?: string;
  clientId?: string;
  originatingRoute: string;
  workflowStep?: string;
};

const CONTEXT_STORAGE_KEY = 'licenceguard.externalDocumentContext';

export async function openExternalDocument(
  resolveUrl: () => Promise<string> | string,
  context: ExternalDocumentContext
): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const scrollY = window.scrollY;
    window.sessionStorage.setItem(
      CONTEXT_STORAGE_KEY,
      JSON.stringify({ ...context, scrollY, openedAt: new Date().toISOString() })
    );

    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      throw new Error('Allow pop-ups for LicenceGuard to open this document in a new tab.');
    }
    previewWindow.opener = null;
    previewWindow.document.title = 'Opening secure document...';

    try {
      previewWindow.location.href = await resolveUrl();
    } catch (error) {
      previewWindow.close();
      throw error;
    }
    return;
  }

  const url = await resolveUrl();
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('This device cannot open the selected document link.');
  }
  await Linking.openURL(url);
}
