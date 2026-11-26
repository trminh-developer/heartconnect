import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from '../models';
import { userService } from '../services';

export function useDiscoveryFeed(user?: User | null) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [locationRequired, setLocationRequired] = useState(false);
  const [revision, setRevision] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const key = JSON.stringify([user?.id, user?.datingPreference, user?.location, user?.locationUpdatedAt,
    user?.interests, user?.relationshipGoal, user?.dateOfBirth, user?.datingVisible]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const generationRef = generation;
    const current = ++generationRef.current;
    cursor.current = null;
    inFlight.current = true;
    setUsers([]);
    setIsLoading(true);
    setIsLoadingMore(false);
    setLoadError(false);
    setHasMore(false);
    setLocationRequired(false);
    const load = async () => {
      try {
        let pageUsers: User[] = [];
        let nextCur: string | null = null;
        let locReq = false;

        if (user?.id) {
          try {
            const page = await userService.getDiscoveryFeed();
            pageUsers = page.users || [];
            nextCur = page.nextCursor;
            locReq = page.locationRequired;
          } catch (e) {
            console.warn('getDiscoveryFeed failed, trying recommendedUsers fallback:', e);
          }
        }

        if (pageUsers.length === 0) {
          try {
            pageUsers = await userService.getRecommendedUsers(user?.id || '', 20);
          } catch (e) {
            console.warn('getRecommendedUsers fallback failed, trying nearbyUsers:', e);
            try {
              pageUsers = await userService.getNearbyUsers(user?.id || '', 20);
            } catch {
              pageUsers = [];
            }
          }
        }

        if (generation.current !== current) return;
        setUsers(pageUsers);
        cursor.current = nextCur;
        setHasMore(!!nextCur);
        setLocationRequired(locReq);
      } catch {
        if (generation.current === current) setLoadError(true);
      } finally {
        if (generation.current === current) { inFlight.current = false; setIsLoading(false); }
      }
    };
    void load();
    return () => { generationRef.current++; };
  }, [key, revision, user?.id]);

  const loadMore = useCallback(async () => {
    if (!cursor.current || inFlight.current || !user?.id) return;
    const current = generation.current;
    inFlight.current = true;
    setIsLoadingMore(true);
    setLoadError(false);
    try {
      const page = await userService.getDiscoveryFeed(cursor.current);
      if (generation.current !== current) return;
      setUsers(previous => {
        const ids = new Set(previous.map(profile => profile.id));
        return [...previous, ...page.users.filter(profile => !ids.has(profile.id))];
      });
      cursor.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
    } catch (error: any) {
      if (generation.current !== current) return;
      if (error.response?.data?.code === 'REFRESH_FEED') refresh();
      else setLoadError(true);
    } finally {
      if (generation.current === current) { inFlight.current = false; setIsLoadingMore(false); }
    }
  }, [user?.id, refresh]);

  return { users, isLoading, loadError, isLoadingMore, locationRequired, hasMore, loadMore, refresh, key, revision };
}
