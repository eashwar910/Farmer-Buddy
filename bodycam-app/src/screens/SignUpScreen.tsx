import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;
};

export default function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const { themeColors, t } = useAppContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert(t('Error'), t('Please fill in all fields'));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('Error'), t('Passwords do not match'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('Error'), t('Password must be at least 6 characters'));
      return;
    }

    setLoading(true);
    const { error } = await signUp(email.trim().toLowerCase(), password, name.trim());
    setLoading(false);

    if (error) {
      Alert.alert(t('Sign Up Failed'), error.message);
    } else {
      Alert.alert(
        t('Account Created'),
        t('Please check your email to verify your account, then sign in.'),
        [{ text: t('OK'), onPress: () => navigation.navigate('Login') }]
      );
    }
  };

  const styles = getStyles(themeColors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>📹</Text>
          <Text style={styles.title}>{t('Create Account')}</Text>
          <Text style={styles.subtitle}>{t('Join BodyCam Management')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t('Full Name')}</Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor={themeColors.subtext}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('Email')}</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={themeColors.subtext}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('Password')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('Min 6 characters')}
            placeholderTextColor={themeColors.subtext}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>{t('Confirm Password')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('Re-enter password')}
            placeholderTextColor={themeColors.subtext}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('Create Account')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.linkText}>
              {t('Already have an account?')} <Text style={styles.linkBold}>{t('Sign In')}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: themeColors.text,
  },
  subtitle: {
    fontSize: 16,
    color: themeColors.subtext,
    marginTop: 4,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.subtext,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: themeColors.text,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  button: {
    backgroundColor: themeColors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: themeColors.subtext,
    fontSize: 14,
  },
  linkBold: {
    color: themeColors.accent,
    fontWeight: '600',
  },
});
