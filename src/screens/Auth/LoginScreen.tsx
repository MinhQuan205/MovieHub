import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { loginUser } from '../../store/slices/authSlice';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const users = useSelector((state: RootState) => state.auth.users);

  const handleLogin = () => {
    if (email && password) {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (user) {
        dispatch(loginUser(user));
        navigation.replace('App');
      } else {
        alert('Account not found or incorrect password. Please register first!');
      }
    } else {
      alert('Please enter both email and password!');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      
      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>
          <Text style={{ color: '#fff' }}>Movie</Text>
          <Text style={{ color: '#e50914' }}>Hub</Text>
        </Text>
        <Text style={styles.subtitle}>T H E   C I N E M A T I C   W O R L D</Text>
      </View>

      <View style={styles.formContainer}>
        <TextInput 
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        
        <TextInput 
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Sign In</Text>
        </TouchableOpacity>

        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>Sign Up Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414', justifyContent: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 50 },
  logoText: { fontSize: 44, fontWeight: '900', color: '#e50914', letterSpacing: 1, fontFamily: 'sans-serif-black' },
  subtitle: { fontSize: 16, color: '#aaa', marginTop: 10, fontFamily: 'sans-serif-light' },
  formContainer: { paddingHorizontal: 30 },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    fontFamily: 'sans-serif-medium',
  },
  loginButton: {
    backgroundColor: '#e50914',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', fontFamily: 'sans-serif-condensed', letterSpacing: 1 },
  registerContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 },
  registerText: { color: '#aaa', fontSize: 15, fontFamily: 'sans-serif-medium' },
  registerLink: { color: '#e50914', fontSize: 15, fontWeight: 'bold', fontFamily: 'sans-serif-condensed' }
});
