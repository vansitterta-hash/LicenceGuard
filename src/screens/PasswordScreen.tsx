import { useState } from 'react';
import { Text } from 'react-native';
import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { changePassword } from '../services/passwordService';
import { Colors } from '../theme/colors';

export default function PasswordScreen({ recovery = false, error, onDone }: {
  recovery?: boolean; error?: string | null; onDone: () => void | Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      await changePassword(password, confirmation);
      setPassword(''); setConfirmation(''); setComplete(true);
      setMessage('Your password has been changed.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to change password.'); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try { await onDone(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to return to sign in. Please retry.'); }
    finally { setBusy(false); }
  };
  return <Screen maxWidth={560}><Card title={recovery ? 'Reset password' : 'Change password'}>
    {error ? <Text style={{ color: Colors.text }}>{error}</Text> : complete ? null : <>
      <TextField label="New password" secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
      <TextField label="Confirm new password" secureTextEntry autoCapitalize="none" value={confirmation} onChangeText={setConfirmation} />
      <Text style={{ color: Colors.text }}>Use at least 8 characters.</Text>
      <Button title="Save password" loading={busy} onPress={() => void save()} />
    </>}
    {message ? <Text accessibilityRole="alert" style={{ color: Colors.text }}>{message}</Text> : null}
    <Button title={recovery ? 'Return to sign in' : 'Back to account'} disabled={busy} variant="secondary" onPress={() => void finish()} />
  </Card></Screen>;
}
