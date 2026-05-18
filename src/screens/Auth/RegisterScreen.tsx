import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { registerUser } from '../../store/slices/authSlice';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const users = useSelector((state: RootState) => state.auth.users);

  const handleRegister = () => {
    if (name && email && password) {
      const userExists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
      if (userExists) {
        alert('This email is already registered! Please sign in.');
        return;
      }

      dispatch(registerUser({ name, email: email.toLowerCase(), password }));
      alert('Registration successful! Please sign in.');
      navigation.goBack();
    } else {
      alert('Please fill in all fields!');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>⬅ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Account</Text>
      </View>

      <View style={styles.formContainer}>
        <TextInput 
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#888"
          value={name}
          onChangeText={setName}
        />

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

        <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
          <Text style={styles.registerButtonText}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414', paddingTop: 50 },
  header: { paddingHorizontal: 20, marginBottom: 40 },
  backBtn: { marginBottom: 20 },
  backBtnText: { color: '#e50914', fontSize: 16, fontWeight: 'bold', fontFamily: 'sans-serif-condensed' },
  title: { fontSize: 34, fontWeight: 'bold', color: '#fff', fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
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
  registerButton: {
    backgroundColor: '#e50914',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  registerButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', fontFamily: 'sans-serif-condensed', letterSpacing: 1 },
});
