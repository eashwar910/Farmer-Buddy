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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;
};

type RoleOption = {
  key: 'employee' | 'gardener' | 'manager';
  label: string;
  description: string;
  icon: string;
  colors: [string, string];
};

const ROLE_OPTIONS: RoleOption[] = [
  {
    key: 'employee',
    label: 'Employee',
    description: 'Stream shifts with a bodycam and access farm tools',
    icon: 'account-hard-hat',
    colors: ['#374151', '#111827'],
  },
  {
    key: 'gardener',
    label: 'Gardener',
    description: 'Access leaf detection, IoT sensors, and the agronomist chatbot',
    icon: 'leaf',
    colors: ['#065f46', '#022c22'],
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Monitor employee streams, view reports, and manage shifts',
    icon: 'account-tie',
    colors: ['#2A3024', '#1A1E16'],
  },
];

export default function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const { themeColors, t } = useAppContext();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validateStep1 = () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert(t('Error'), t('Please fill in all fields'));
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('Error'), t('Passwords do not match'));
      return false;
    }
    if (password.length < 6) {
      Alert.alert(t('Error'), t('Password must be at least 6 characters'));
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSelectRole = async (role: RoleOption['key']) => {
    setLoading(true);
    const { error } = await signUp(email.trim().toLowerCase(), password, name.trim(), role);
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
          <Text style={styles.title}>
            {step === 1 ? t('Create Account') : 'Choose Your Role'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? t('Join BodyCam Management')
              : 'Select how you will use Farmer Buddy'}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepLine, step === 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 2 && styles.stepDotActive]} />
        </View>

        {step === 1 ? (
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

            <TouchableOpacity style={styles.button} onPress={handleContinue}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.linkText}>
                {t('Already have an account?')}{' '}
                <Text style={styles.linkBold}>{t('Sign In')}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.roleSection}>
            {ROLE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.roleCard}
                onPress={() => handleSelectRole(option.key)}
                disabled={loading}
                activeOpacity={0.8}
              >
                <View style={[styles.roleIconCircle, { backgroundColor: option.colors[0] }]}>
                  <MaterialCommunityIcons
                    name={option.icon as any}
                    size={28}
                    color="#fff"
                  />
                </View>
                <View style={styles.roleTextBlock}>
                  <Text style={styles.roleLabel}>{option.label}</Text>
                  <Text style={styles.roleDesc}>{option.description}</Text>
                </View>
                {loading ? (
                  <ActivityIndicator size="small" color={themeColors.accent} />
                ) : (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={themeColors.subtext}
                  />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(1)}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
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
    marginBottom: 24,
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
    textAlign: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 0,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: themeColors.border,
  },
  stepDotActive: {
    backgroundColor: themeColors.accent,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: themeColors.border,
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: themeColors.accent,
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
  roleSection: {
    gap: 12,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    gap: 14,
  },
  roleIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleTextBlock: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 2,
  },
  roleDesc: {
    fontSize: 13,
    color: themeColors.subtext,
    lineHeight: 18,
  },
  backButton: {
    marginTop: 8,
    alignItems: 'center',
    padding: 12,
  },
  backButtonText: {
    color: themeColors.subtext,
    fontSize: 14,
  },
});
