import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Modal } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { logoutUser } from '../../store/slices/authSlice';

export default function ProfileScreen({ navigation }: any) {
  const [showAbout, setShowAbout] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.currentUser);

  const handleLogout = () => {
    dispatch(logoutUser());
    navigation.replace('Auth');
  };

  const menuItems = [
    { icon: '⚙️', title: 'Account Settings' },
    { icon: '🔔', title: 'Notifications' },
    { icon: '🔒', title: 'Privacy & Security' },
    { icon: '🎧', title: 'Help & Support' },
    { icon: 'ℹ️', title: 'About MovieHub' },
  ];

  const firstLetter = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{firstLetter}</Text>
          </View>
          <Text style={styles.userName}>{currentUser?.name || 'Guest User'}</Text>
          <Text style={styles.userEmail}>{currentUser?.email || 'guest@moviehub.com'}</Text>
          <TouchableOpacity style={styles.editBtn}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => {
                if (item.title === 'About MovieHub') setShowAbout(true);
                if (item.title === 'Help & Support') setShowSupport(true);
              }}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={styles.menuTitle}>{item.title}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutBtnText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* About Modal */}
      <Modal visible={showAbout} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🎬 About MovieHub</Text>
            <Text style={styles.modalText}>
              Welcome to MovieHub – The Cinematic World
              {'\n\n'}
              This application was developed with all our dedication by a team of 2 members. Our goal is to create the best possible movie-discovery experience on mobile.
              {'\n\n'}
              The interface and features of MovieHub are strongly inspired by leading entertainment platforms such as Netflix, IMDb, and TMDB, in order to deliver the smoothest, most premium, and most professional experience for users.
              {'\n\n'}
              Thank you for trying our product! ❤️
            </Text>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowAbout(false)}>
              <Text style={styles.closeModalBtnText}>ĐÓNG</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Support Modal */}
      <Modal visible={showSupport} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🎧 Help & Support</Text>
            <Text style={styles.modalText}>
              If you have any issues that need to be resolved, or simply want to provide feedback to make the app better, please don't hesitate to contact us via email:
              {'\n\n'}
              <Text style={{ fontWeight: 'bold', color: '#fff' }}>beerusnguyen22082005@gmail.com</Text>
              {'\n\n'}
              We typically respond within 24 hours. Thank you!
            </Text>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowSupport(false)}>
              <Text style={styles.closeModalBtnText}>ĐÓNG</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header: { padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#222' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },

  profileSection: { alignItems: 'center', paddingVertical: 30, borderBottomWidth: 1, borderBottomColor: '#222' },
  avatarContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#e50914',
    justifyContent: 'center', alignItems: 'center', marginBottom: 15,
    elevation: 5, shadowColor: '#e50914', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
  },
  avatarText: { fontSize: 40, fontWeight: 'bold', color: '#fff', fontFamily: 'sans-serif-condensed' },
  userName: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 5, fontFamily: 'sans-serif-condensed' },
  userEmail: { fontSize: 16, color: '#aaa', fontFamily: 'sans-serif-medium', marginBottom: 20 },
  editBtn: { backgroundColor: '#333', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 20 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold', fontFamily: 'sans-serif-medium' },

  menuSection: { padding: 20 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#222' },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { fontSize: 20, marginRight: 15 },
  menuTitle: { fontSize: 16, color: '#ddd', fontFamily: 'sans-serif-medium' },
  menuArrow: { fontSize: 24, color: '#555', fontFamily: 'sans-serif-light' },

  logoutBtn: { backgroundColor: '#e50914', marginHorizontal: 20, marginTop: 20, paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  logoutBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold', fontFamily: 'sans-serif-condensed', letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#222', padding: 25, borderRadius: 15, width: '100%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#e50914', fontSize: 24, fontWeight: 'bold', fontFamily: 'sans-serif-black', marginBottom: 15, textAlign: 'center' },
  modalText: { color: '#ccc', fontSize: 16, fontFamily: 'sans-serif-medium', lineHeight: 24, textAlign: 'justify' },
  closeModalBtn: { backgroundColor: '#e50914', marginTop: 25, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  closeModalBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', fontFamily: 'sans-serif-condensed', letterSpacing: 1 }
});
