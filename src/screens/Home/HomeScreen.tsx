import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView, SafeAreaView } from 'react-native';
import { useGetTrendingQuery, useGetPopularQuery } from '../../services/api/tmdbApi';
import MovieCard from '../../components/movie/MovieCard';

const MOCK_MOVIES = [
  { id: 1, title: 'Inception', vote_average: 8.8, poster_path: null },
  { id: 2, title: 'The Dark Knight', vote_average: 9.0, poster_path: null },
  { id: 3, title: 'Interstellar', vote_average: 8.6, poster_path: null },
  { id: 4, title: 'Avatar', vote_average: 7.9, poster_path: null },
];

export default function HomeScreen({ navigation }: any) {
  const { data: trendingData, isLoading: isLoadingTrending } = useGetTrendingQuery();
  const { data: popularData, isLoading: isLoadingPopular } = useGetPopularQuery();

  const trendingMovies = trendingData?.results || MOCK_MOVIES;
  const popularMovies = popularData?.results || MOCK_MOVIES;

  const top15Trending = trendingMovies.slice(0, 15);
  const top15Popular = popularMovies.slice(0, 15);

  // Nhân đôi mảng để làm hiệu ứng cuộn vô tận (Seamless Infinite Marquee)
  const infiniteTrending = [...top15Trending, ...top15Trending];
  const infinitePopular = [...top15Popular, ...top15Popular];

  const trendingRef = useRef<FlatList>(null);
  const popularRef = useRef<FlatList>(null);

  // Dùng refs để kiểm tra xem user có đang tự kéo màn hình không
  const isDraggingTrending = useRef(false);
  const isDraggingPopular = useRef(false);

  // Lưu vị trí cuộn hiện tại
  const offset1Ref = useRef(0);
  const offset2Ref = useRef(0);

  // Auto-scroll trượt chậm liên tục (Marquee effect)
  useEffect(() => {
    let animationFrameId: number;

    const scroll = () => {
      if (!isDraggingTrending.current && infiniteTrending.length > 0) {
        offset1Ref.current += 0.5; // Tốc độ trượt
        if (offset1Ref.current >= 155 * top15Trending.length) {
          offset1Ref.current -= 155 * top15Trending.length; 
        }
        trendingRef.current?.scrollToOffset({ offset: offset1Ref.current, animated: false });
      }

      if (!isDraggingPopular.current && infinitePopular.length > 0) {
        offset2Ref.current += 0.5; // Danh sách dưới trượt nhanh hơn xíu
        if (offset2Ref.current >= 155 * top15Popular.length) {
          offset2Ref.current -= 155 * top15Popular.length;
        }
        popularRef.current?.scrollToOffset({ offset: offset2Ref.current, animated: false });
      }

      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);

    return () => cancelAnimationFrame(animationFrameId);
  }, [trendingMovies, popularMovies]);

  // getItemLayout giúp FlatList tính toán khoảng cách để scrollToIndex hoạt động chính xác
  // Width của MovieCard là 140, marginRight là 15 => Tổng là 155
  const getItemLayout = (data: any, index: number) => ({
    length: 155,
    offset: 155 * index,
    index,
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.logo}>
            <Text style={{ color: '#fff' }}>Movie</Text>
            <Text style={{ color: '#e50914' }}>Hub</Text>
          </Text>
        </View>

        {/* Trending Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Today</Text>
          {isLoadingTrending ? (
            <ActivityIndicator size="large" color="#e50914" />
          ) : (
            <View
              onTouchStart={() => (isDraggingTrending.current = true)}
              onTouchEnd={() => setTimeout(() => (isDraggingTrending.current = false), 2000)}
              onTouchCancel={() => setTimeout(() => (isDraggingTrending.current = false), 2000)}
            >
              <FlatList 
                ref={trendingRef}
                data={infiniteTrending} // Dùng mảng nhân đôi
                horizontal
                keyExtractor={(item, index) => `${item.id}-${index}`} // Thêm index để key không bị trùng
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                getItemLayout={getItemLayout}
                onScrollBeginDrag={() => (isDraggingTrending.current = true)}
                onScrollEndDrag={() => setTimeout(() => (isDraggingTrending.current = false), 2000)}
                onMomentumScrollBegin={() => (isDraggingTrending.current = true)}
                onMomentumScrollEnd={() => setTimeout(() => (isDraggingTrending.current = false), 2000)}
                onScroll={(e) => {
                  if (isDraggingTrending.current) {
                    offset1Ref.current = e.nativeEvent.contentOffset.x;
                  }
                }}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                  <MovieCard movie={item} onPress={() => navigation.navigate('MovieDetail', { movieId: item.id })} />
                )}
              />
            </View>
          )}
        </View>

        {/* Popular Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Movies</Text>
          {isLoadingPopular ? (
            <ActivityIndicator size="large" color="#e50914" />
          ) : (
            <View
              onTouchStart={() => (isDraggingPopular.current = true)}
              onTouchEnd={() => setTimeout(() => (isDraggingPopular.current = false), 2000)}
              onTouchCancel={() => setTimeout(() => (isDraggingPopular.current = false), 2000)}
            >
              <FlatList 
                ref={popularRef}
                data={infinitePopular}
                horizontal
                keyExtractor={(item, index) => `${item.id}-${index}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                getItemLayout={getItemLayout}
                onScrollBeginDrag={() => (isDraggingPopular.current = true)}
                onScrollEndDrag={() => setTimeout(() => (isDraggingPopular.current = false), 2000)}
                onMomentumScrollBegin={() => (isDraggingPopular.current = true)}
                onMomentumScrollEnd={() => setTimeout(() => (isDraggingPopular.current = false), 2000)}
                onScroll={(e) => {
                  if (isDraggingPopular.current) {
                    offset2Ref.current = e.nativeEvent.contentOffset.x;
                  }
                }}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                  <MovieCard movie={item} onPress={() => navigation.navigate('MovieDetail', { movieId: item.id })} />
                )}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header: { padding: 20, paddingTop: 10 },
  logo: { fontSize: 32, fontWeight: '900', color: '#e50914', fontFamily: 'sans-serif-black', letterSpacing: 1 },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginLeft: 20, marginBottom: 15, fontFamily: 'sans-serif-condensed', letterSpacing: 0.5 },
});
