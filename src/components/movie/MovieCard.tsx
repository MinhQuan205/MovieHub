import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';

interface MovieCardProps {
  movie: any;
  onPress: () => void;
}

export default function MovieCard({ movie, onPress }: MovieCardProps) {
  // Build URL ảnh nếu có, không có thì dùng ảnh xám tạm
  const imageUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
    : 'https://via.placeholder.com/140x210/333333/FFFFFF?text=No+Image';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <Image source={{ uri: imageUrl }} style={styles.poster} />
      <Text style={styles.title} numberOfLines={1}>{movie.title}</Text>
      <View style={styles.ratingContainer}>
        <Text style={styles.ratingText}>⭐ {movie.vote_average?.toFixed(1) || 'N/A'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { width: 140, marginRight: 15 },
  poster: { width: 140, height: 210, borderRadius: 10, backgroundColor: '#333' },
  title: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginTop: 8, fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
  ratingContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  ratingText: { color: '#aaa', fontSize: 12, fontFamily: 'sans-serif-medium' },
});
