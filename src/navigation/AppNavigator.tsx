import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/Home/HomeScreen';
import SearchScreen from '../screens/Search/SearchScreen';
import WatchlistScreen from '../screens/Watchlist/WatchlistScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({ 
        tabBarActiveTintColor: '#e50914',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#141414', borderTopColor: '#333', paddingBottom: 5, height: 60 },
        headerStyle: { backgroundColor: '#141414' },
        headerTintColor: '#fff',
        tabBarIcon: ({ focused }) => {
          let icon = '';
          if (route.name === 'Home') icon = '🏠';
          else if (route.name === 'Search') icon = '🔍';
          else if (route.name === 'Watchlist') icon = '🔖';
          else if (route.name === 'Profile') icon = '👤';
          
          return (
            <Text style={{ 
              fontSize: 22, 
              opacity: focused ? 1 : 0.4,
              textShadowColor: focused ? 'rgba(229, 9, 20, 0.5)' : 'transparent',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 10
            }}>
              {icon}
            </Text>
          );
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: 'Watchlist' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
