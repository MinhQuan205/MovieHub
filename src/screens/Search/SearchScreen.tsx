import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, ActivityIndicator, SafeAreaView, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useSearchMoviesQuery, useGetMoviesByGenreQuery, useGetTvByGenreQuery } from '../../services/api/tmdbApi';
import { useDebounce } from '../../hooks/useDebounce';

const GENRES = [
  { id: -1, name: '📺 TV Series' },
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
];

const correctTypo = (text: string) => {
  const str = text.toLowerCase().trim();
  const dictionary: Record<string, string> = {
    'zotopiam': 'zootopia',
    'zotopia': 'zootopia',
    'advenger': 'avengers',
    'avanger': 'avengers',
    'avangers': 'avengers',
    'bat man': 'batman',
    'spidar': 'spider',
    'spuder': 'spider',
    'ironman': 'iron man',
    'harry poter': 'harry potter',
    'starwar': 'star wars',
    'minion': 'minions',
    'suparman': 'superman',
    'transfomer': 'transformer',
    'jurasic': 'jurassic',
  };
  return dictionary[str] || str;
};

export default function SearchScreen({ route, navigation }: any) {
  const initialGenre = route.params?.genreId;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<number[]>(initialGenre ? [initialGenre] : []);
  const [showFilters, setShowFilters] = useState(!!initialGenre);
  const debouncedQuery = useDebounce(query, 500);
  const processedQuery = correctTypo(debouncedQuery);
  
  // Lắng nghe sự kiện chuyển trang có mang theo genreId
  useEffect(() => {
    if (route.params?.genreId) {
      const gId = route.params.genreId;
      setSelectedGenres([gId]);
      setShowFilters(true);
      setQuery('');
      setPage(1);
    }
  }, [route.params?.genreId]);
  
  // Khi user bắt đầu gõ tìm kiếm, tự động bỏ chọn thể loại
  useEffect(() => {
    if (query.length > 0 && selectedGenres.length > 0) {
      setSelectedGenres([]);
    }
  }, [query]);

  // Reset trang về 1 mỗi khi gõ từ khóa mới hoặc đổi thể loại
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, selectedGenres.join(',')]);

  const { data: searchData, isLoading: isSearchLoading, isFetching: isSearchFetching } = useSearchMoviesQuery(
    { query: processedQuery, page }, 
    { skip: processedQuery.length === 0 }
  );

  const isTvSeries = selectedGenres.includes(-1);
  const tvGenreIds = selectedGenres.filter(id => id !== -1).join(',');

  const { data: movieGenreData, isLoading: isMovieLoading, isFetching: isMovieFetching } = useGetMoviesByGenreQuery(
    { genreIds: selectedGenres.join(','), page },
    { skip: isTvSeries || selectedGenres.length === 0 || debouncedQuery.length > 0 }
  );

  const { data: tvGenreData, isLoading: isTvLoading, isFetching: isTvFetching } = useGetTvByGenreQuery(
    { genreIds: tvGenreIds, page },
    { skip: !isTvSeries || debouncedQuery.length > 0 }
  );

  const isSearchingText = debouncedQuery.length > 0;
  const activeData = isSearchingText ? searchData : (isTvSeries ? tvGenreData : movieGenreData);
  const isActiveLoading = isSearchingText ? (isSearchLoading || isSearchFetching) : (isTvSeries ? (isTvLoading || isTvFetching) : (isMovieLoading || isMovieFetching));

  const [smartSuggestion, setSmartSuggestion] = useState('');

  useEffect(() => {
    if (activeData?.results?.length === 0 && processedQuery.length > 2 && isSearchingText) {
      fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(processedQuery + ' movie')}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            let suggestion = data[0].phrase.replace(/ movies in order| movies| movie/g, '').trim();
            if (suggestion !== processedQuery.toLowerCase()) {
              setSmartSuggestion(suggestion);
            } else {
              setSmartSuggestion('');
            }
          } else {
            setSmartSuggestion('');
          }
        })
        .catch(() => setSmartSuggestion(''));
    } else {
      setSmartSuggestion('');
    }
  }, [activeData?.results?.length, processedQuery, isSearchingText]);

  const handleGenreSelect = (genreId: number) => {
    if (selectedGenres.includes(genreId)) {
      setSelectedGenres(prev => prev.filter(id => id !== genreId));
    } else {
      setSelectedGenres(prev => [...prev, genreId]);
      setQuery('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔍 Search Movies</Text>
        
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a movie name..."
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
          />
          <TouchableOpacity 
            style={[styles.filterBtn, showFilters && styles.filterBtnActive]} 
            onPress={() => setShowFilters(!showFilters)}
          >
            <Text style={styles.filterBtnText}>🎛️</Text>
          </TouchableOpacity>
        </View>

        {processedQuery.length > 0 && processedQuery !== debouncedQuery.toLowerCase().trim() && (
          <Text style={styles.didYouMeanText}>
            Showing results for: <Text style={{ fontWeight: 'bold', color: '#e50914' }}>{processedQuery}</Text>
          </Text>
        )}

        {showFilters && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genresWrapper}>
            {GENRES.map((g) => {
              const isActive = selectedGenres.includes(g.id);
              return (
                <TouchableOpacity 
                  key={g.id} 
                  style={[styles.genreChip, isActive && styles.genreChipActive]}
                  onPress={() => handleGenreSelect(g.id)}
                >
                  <Text style={[styles.genreText, isActive && styles.genreTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {isActiveLoading && <ActivityIndicator size="large" color="#e50914" style={{ marginTop: 20 }} />}

      {!isActiveLoading && activeData?.results?.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>😕</Text>
          <Text style={styles.emptyText}>No matches found</Text>
          {smartSuggestion ? (
            <TouchableOpacity style={styles.suggestionBox} onPress={() => setQuery(smartSuggestion)}>
              <Text style={styles.emptySubtext}>Did you mean: <Text style={styles.suggestionHighlight}>{smartSuggestion}</Text>?</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.emptySubtext}>Try checking your spelling or adjusting filters.</Text>
          )}
        </View>
      )}

      {!isActiveLoading && activeData?.results && activeData.results.length > 0 && (
        <FlatList
          data={activeData.results}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultItem} onPress={() => navigation.navigate('MovieDetail', { movieId: item.id, type: isTvSeries ? 'tv' : 'movie' })}>
              <Image 
                source={{ uri: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : 'https://via.placeholder.com/100x150/333333/FFFFFF?text=No+Img' }}
                style={styles.poster}
              />
              <View style={styles.info}>
                <Text style={styles.movieTitle}>{item.title || item.name}</Text>
                <Text style={styles.movieMeta}>⭐ {item.vote_average?.toFixed(1)}  •  {(item.release_date || item.first_air_date)?.substring(0, 4)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={() => {
            if (!activeData || activeData.total_pages <= 1) return null;
            const totalPages = activeData.total_pages;

            return (
              <View style={styles.paginationContainer}>
                <TouchableOpacity disabled={page === 1} onPress={() => setPage(p => p - 1)} style={styles.pageButton}>
                  <Text style={[styles.pageButtonText, page === 1 && { opacity: 0.3 }]}>←</Text>
                </TouchableOpacity>

                {page > 2 && (
                  <>
                    <TouchableOpacity onPress={() => setPage(1)}><Text style={styles.pageNumber}>1</Text></TouchableOpacity>
                    <Text style={styles.pageDots}>...</Text>
                  </>
                )}

                {page > 1 && (
                  <TouchableOpacity onPress={() => setPage(page - 1)}><Text style={styles.pageNumber}>{page - 1}</Text></TouchableOpacity>
                )}

                <View style={styles.activePageWrapper}>
                  <Text style={styles.activePageText}>{page}</Text>
                </View>

                {page < totalPages && (
                  <TouchableOpacity onPress={() => setPage(page + 1)}><Text style={styles.pageNumber}>{page + 1}</Text></TouchableOpacity>
                )}

                {page < totalPages - 1 && (
                  <>
                    <Text style={styles.pageDots}>...</Text>
                    <TouchableOpacity onPress={() => setPage(totalPages)}><Text style={styles.pageNumber}>{totalPages}</Text></TouchableOpacity>
                  </>
                )}

                <TouchableOpacity disabled={page === totalPages} onPress={() => setPage(p => p + 1)} style={styles.pageButton}>
                  <Text style={[styles.pageButtonText, page === totalPages && { opacity: 0.3 }]}>→</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header: { padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 15, fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#333', color: '#fff', padding: 15, borderRadius: 8, fontSize: 16, fontFamily: 'sans-serif-medium' },
  filterBtn: { backgroundColor: '#333', padding: 15, borderRadius: 8, marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#e50914' },
  filterBtnText: { fontSize: 18 },
  didYouMeanText: { color: '#aaa', fontSize: 14, marginTop: 10, fontFamily: 'sans-serif-medium' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 50, marginBottom: 15 },
  emptyText: { color: '#fff', fontSize: 20, fontWeight: 'bold', fontFamily: 'sans-serif-condensed' },
  emptySubtext: { color: '#888', fontSize: 15, marginTop: 5, fontFamily: 'sans-serif-medium' },
  suggestionBox: { marginTop: 15, backgroundColor: '#222', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 25, borderWidth: 1, borderColor: '#e50914' },
  suggestionHighlight: { color: '#e50914', fontWeight: 'bold' },
  genresWrapper: { marginTop: 15, flexDirection: 'row' },
  genreChip: { backgroundColor: '#222', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#333' },
  genreChipActive: { backgroundColor: '#e50914', borderColor: '#e50914' },
  genreText: { color: '#aaa', fontSize: 14, fontFamily: 'sans-serif-medium' },
  genreTextActive: { color: '#fff', fontWeight: 'bold' },
  resultItem: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#222', borderRadius: 8, overflow: 'hidden' },
  poster: { width: 80, height: 120, backgroundColor: '#333' },
  info: { flex: 1, padding: 15, justifyContent: 'center' },
  movieTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 5, fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
  movieMeta: { color: '#aaa', fontSize: 14, fontFamily: 'sans-serif-medium' },
  paginationContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 30 },
  pageButton: { padding: 10 },
  pageButtonText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  pageNumber: { color: '#aaa', fontSize: 16, marginHorizontal: 8, fontFamily: 'sans-serif-medium' },
  activePageWrapper: { backgroundColor: '#e50914', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8 },
  activePageText: { color: '#fff', fontSize: 16, fontWeight: 'bold', fontFamily: 'sans-serif-medium' },
  pageDots: { color: '#aaa', fontSize: 16, marginHorizontal: 4 }
});
