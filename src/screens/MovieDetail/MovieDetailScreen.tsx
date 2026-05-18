import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, TouchableOpacity, FlatList, SafeAreaView } from 'react-native';
import { useGetMovieDetailQuery, useGetTvDetailQuery } from '../../services/api/tmdbApi';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { toggleWatchlist } from '../../store/slices/watchlistSlice';
import YoutubePlayer from 'react-native-youtube-iframe';
import MovieCard from '../../components/movie/MovieCard';

export default function MovieDetailScreen({ route, navigation }: any) {
  const { movieId, type } = route.params;
  const isTV = type === 'tv';
  const { data: movieData, isLoading: isMovieLoading } = useGetMovieDetailQuery(movieId, { skip: isTV });
  const { data: tvData, isLoading: isTvLoading } = useGetTvDetailQuery(movieId, { skip: !isTV });
  
  const movie = isTV ? tvData : movieData;
  const isLoading = isTV ? isTvLoading : isMovieLoading;
  
  const dispatch = useDispatch();
  const watchlist = useSelector((state: RootState) => state.watchlist.movies);
  const isSaved = watchlist.some((m) => m.id === movieId);
  
  const [showVideo, setShowVideo] = useState(false);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  if (!movie) return null;

  const trailer = movie.videos?.results?.find(
    (vid: any) => vid.site === 'YouTube' && vid.type === 'Trailer'
  );

  const backdropUrl = movie.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`
    : 'https://via.placeholder.com/780x440/333333/FFFFFF?text=No+Image';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.backdropContainer}>
          <Image source={{ uri: backdropUrl }} style={styles.backdrop} />
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>⬅ Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Image source={{ uri: `https://image.tmdb.org/t/p/w500${movie.poster_path || movie.backdrop_path}` }} style={styles.poster} />
          
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{movie.title || movie.name}</Text>
            <TouchableOpacity 
              style={[styles.saveButton, isSaved && styles.saveButtonActive]} 
              onPress={() => dispatch(toggleWatchlist(movie))}
            >
              <Text style={styles.saveButtonText}>{isSaved ? '✔ Saved' : '+ Save'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.tagline}>{movie.tagline}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>⭐ {movie.vote_average?.toFixed(1)}</Text>
            <Text style={styles.metaText}>  •  </Text>
            <Text style={styles.metaText}>{movie.runtime || (movie.episode_run_time && movie.episode_run_time[0]) || 0} min</Text>
            <Text style={styles.metaText}>  •  </Text>
            <Text style={styles.metaText}>{(movie.release_date || movie.first_air_date)?.substring(0, 4)}</Text>
          </View>

          <View style={styles.genresRow}>
            {movie.genres?.map((g: any) => (
              <TouchableOpacity 
                key={g.id} 
                style={styles.genreChip}
                onPress={() => navigation.navigate('App', { screen: 'Search', params: { genreId: g.id } })}
              >
                <Text style={styles.genreText}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {showVideo && trailer ? (
            <View style={styles.videoContainer}>
              <YoutubePlayer
                height={200}
                play={true}
                videoId={trailer.key}
                onChangeState={(state) => {
                  if (state === 'ended') setShowVideo(false);
                }}
              />
            </View>
          ) : (
            trailer && (
              <TouchableOpacity style={styles.trailerButton} onPress={() => setShowVideo(true)} activeOpacity={0.8}>
                <Text style={styles.trailerButtonText}>▶ WATCH TRAILER</Text>
              </TouchableOpacity>
            )
          )}

          <Text style={styles.sectionTitle}>Storyline</Text>
          <Text style={styles.overview}>{movie.overview}</Text>

          <Text style={styles.sectionTitle}>Cast</Text>
          <FlatList
            data={movie.credits?.cast?.slice(0, 10)}
            horizontal
            keyExtractor={(item) => item.id.toString()}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.castItem}>
                <Image
                  source={{ uri: item.profile_path ? `https://image.tmdb.org/t/p/w185${item.profile_path}` : 'https://via.placeholder.com/100/333333/FFFFFF?text=No+Img' }}
                  style={styles.castImage}
                />
                <Text style={styles.castName} numberOfLines={2}>{item.name}</Text>
              </View>
            )}
          />

          {movie.similar?.results?.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionTitle}>More Like This</Text>
              <FlatList 
                data={movie.similar.results.slice(0, 10)}
                horizontal
                keyExtractor={(item) => item.id.toString()}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <MovieCard 
                    movie={item} 
                    onPress={() => navigation.push('MovieDetail', { movieId: item.id })} 
                  />
                )}
              />
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  center: { justifyContent: 'center', alignItems: 'center' },
  backdropContainer: { position: 'relative', height: 250 },
  backdrop: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8 },
  backButtonText: { color: '#fff', fontWeight: 'bold' },
  content: { padding: 20 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontSize: 30, fontWeight: 'bold', color: '#fff', flex: 1, marginRight: 10, fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
  saveButton: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  saveButtonActive: { backgroundColor: '#e50914' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontFamily: 'sans-serif-medium' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  metaText: { color: '#aaa', fontSize: 14 },
  genresRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  genreChip: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  genreText: { color: '#fff', fontSize: 12, fontFamily: 'sans-serif-medium' },
  trailerButton: { backgroundColor: '#e50914', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  trailerButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', fontFamily: 'sans-serif-condensed', letterSpacing: 1 },
  videoContainer: { borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10, marginTop: 10, fontFamily: 'sans-serif-condensed' },
  overview: { color: '#ddd', fontSize: 15, lineHeight: 24, marginBottom: 20, fontFamily: 'sans-serif-light' },
  castItem: { width: 80, marginRight: 15, alignItems: 'center' },
  castImage: { width: 70, height: 70, borderRadius: 35, marginBottom: 8, backgroundColor: '#333' },
  castName: { color: '#fff', fontSize: 12, textAlign: 'center', fontFamily: 'sans-serif-medium' }
});
