import React from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';

export default function WatchlistScreen({ navigation }: any) {
  const watchlist = useSelector((state: RootState) => state.watchlist.movies);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔖 My Watchlist</Text>
        <Text style={styles.subtitle}>{watchlist.length} movies saved</Text>
      </View>

      {watchlist.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Your watchlist is empty!</Text>
        </View>
      ) : (
        <FlatList
          data={watchlist}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultItem} onPress={() => navigation.navigate('MovieDetail', { movieId: item.id })}>
              <Image 
                source={{ uri: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : 'https://via.placeholder.com/100x150/333333/FFFFFF?text=No+Img' }}
                style={styles.poster}
              />
              <View style={styles.info}>
                <Text style={styles.movieTitle}>{item.title}</Text>
                <Text style={styles.movieMeta}>⭐ {item.vote_average?.toFixed(1)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
  subtitle: { color: '#aaa', marginTop: 5, fontFamily: 'sans-serif-light' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 16, fontFamily: 'sans-serif-medium' },
  resultItem: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#222', borderRadius: 8, overflow: 'hidden' },
  poster: { width: 80, height: 120, backgroundColor: '#333' },
  info: { flex: 1, padding: 15, justifyContent: 'center' },
  movieTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 5, fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
  movieMeta: { color: '#aaa', fontSize: 14, fontFamily: 'sans-serif-medium' }
});
