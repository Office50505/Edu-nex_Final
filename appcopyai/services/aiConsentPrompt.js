import { Alert, Linking } from 'react-native';
import { readAiConsent, saveAiConsent } from './aiConsent';

export function askAiConsent(state) {
  return new Promise(resolve => {
    Alert.alert('Allow AI data sharing?', state.disclosure, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Privacy policy', onPress: () => {
        // Returning to chat never implies consent; the user can send again.
        Linking.openURL('https://skillomate.in/privacy').catch(() => {});
        resolve(false);
      } },
      { text: 'Allow AI', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
export async function manageAiConsent({ session, user }) {
  try {
    const state = await readAiConsent({ session, user });
    const granted = state.granted
      ? await new Promise(resolve => Alert.alert('AI data sharing is on', `${state.disclosure}\n\nWithdraw permission to stop future AI requests?`, [
        { text: 'Keep enabled', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Withdraw permission', style: 'destructive', onPress: () => resolve(false) },
      ], { cancelable: true, onDismiss: () => resolve(null) }))
      : await askAiConsent(state);
    if (granted === null) return;
    await saveAiConsent({ session, user, state, granted });
    Alert.alert(granted ? 'AI data sharing enabled' : 'AI data sharing off', granted
      ? 'You can now use Nex AI.' : 'Future AI requests are blocked. Your course access is unchanged. Delete AI history separately to remove saved chats.');
  } catch (error) {
    Alert.alert('AI privacy settings', error.message || 'Could not save your choice. Please try again.');
  }
}
