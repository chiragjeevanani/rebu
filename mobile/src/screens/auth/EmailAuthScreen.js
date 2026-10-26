import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';
import Segmented from '../../components/Segmented';

export default function EmailAuthScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const signup = mode === 'signup';

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header />
      <View style={styles.body}>
        <Txt variant="h1">
          {signup ? 'Create your account' : 'Welcome back'}
        </Txt>
        <Txt
          variant="body"
          color={colors.textMuted}
          style={{ marginTop: 8, marginBottom: 24 }}
        >
          {signup
            ? 'Sign up with email to start meeting people.'
            : 'Log in with your email and password.'}
        </Txt>
        <Segmented
          options={[
            { key: 'login', label: 'Log in' },
            { key: 'signup', label: 'Sign up' },
          ]}
          value={mode}
          onChange={setMode}
          style={{ marginBottom: 24 }}
        />
        {signup ? (
          <Input
            icon={User}
            placeholder="Full name"
            value={form.name}
            onChangeText={set('name')}
            style={styles.field}
          />
        ) : null}
        <Input
          icon={Mail}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          value={form.email}
          onChangeText={set('email')}
          style={styles.field}
        />
        <Input
          icon={Lock}
          placeholder="Password"
          secureTextEntry={!show}
          value={form.password}
          onChangeText={set('password')}
          style={styles.field}
          right={
            <Pressable onPress={() => setShow(s => !s)} hitSlop={8}>
              {show ? (
                <EyeOff size={19} color={colors.textMuted} />
              ) : (
                <Eye size={19} color={colors.textMuted} />
              )}
            </Pressable>
          }
        />
        {!signup ? (
          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={{ alignSelf: 'flex-end' }}
          >
            <Txt variant="label" color={colors.primary}>
              Forgot password?
            </Txt>
          </Pressable>
        ) : null}
        <Button
          title={signup ? 'Create account' : 'Log in'}
          style={{ marginTop: 28 }}
          onPress={() => navigation.navigate('ProfileSetup')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  field: { marginBottom: 14 },
});
