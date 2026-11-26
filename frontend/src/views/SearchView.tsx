import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserCard } from '../components/user';
import { Button, EmptyState, Loading, AuthPromptModal, SEO } from '../components/common';
import { useAuth } from '../hooks/useAuth';
import { userService } from '../services';
import { User } from '../models';
import './SearchView.css';

const PAGE_SIZE = 24;

const SearchView = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const gender = searchParams.get('gender') ?? 'all';
  const ageMin = searchParams.get('ageMin') ?? '';
  const ageMax = searchParams.get('ageMax') ?? '';
  const onlineStatus = searchParams.get('onlineStatus') ?? 'all';
  const requestedPage = Number(searchParams.get('page') ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 40000 ? requestedPage : 1;
  const validAge = (value: string) => value === '' || (/^\d+$/.test(value) && Number(value) >= 18 && Number(value) <= 100);
  const validAges = validAge(ageMin) && validAge(ageMax) && (!ageMin || !ageMax || Number(ageMin) <= Number(ageMax));
  const validFilters = ['all', 'male', 'female', 'other'].includes(gender) &&
    ['all', 'online', 'offline'].includes(onlineStatus) && query.trim().length <= 150;

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [searchFailed, setSearchFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const searchImmediately = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setSearchFailed(false);
    if (!validAges || !validFilters) {
      setIsSearching(false);
      return () => controller.abort();
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const users = await userService.searchUsers(query.trim(), {
          gender, ...(ageMin ? { ageMin: Number(ageMin) } : {}), ...(ageMax ? { ageMax: Number(ageMax) } : {}), onlineStatus,
          limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE,
        }, controller.signal);
        if (controller.signal.aborted) return;
        setResults(users.slice(0, PAGE_SIZE));
        setHasMore(users.length > PAGE_SIZE);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setHasMore(false);
          setSearchFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, searchImmediately.current ? 0 : 300);
    searchImmediately.current = false;
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, gender, ageMin, ageMax, onlineStatus, page, validAges, validFilters, revision]);

  const updateFilter = (key: string, value: string, defaultValue = '') => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
      next.delete('page');
      return next;
    }, { replace: true });
  };

  const retrySearch = () => {
    searchImmediately.current = true;
    setRevision(value => value + 1);
  };
  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateFilter('q', query.trim());
    retrySearch();
  };
  const handleClear = () => {
    setSearchParams({}, { replace: true });
    retrySearch();
  };
  const changePage = (nextPage: number) => {
    searchImmediately.current = true;
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (nextPage === 1) next.delete('page');
      else next.set('page', String(nextPage));
      return next;
    });
  };
  const validationError = !validAges ? t('search.invalid_age_range') : !validFilters ? t('search.invalid_filters') : '';

  return (
    <div className="search-view fade-in">
      <SEO title={t('search.title')} description={t('search.description')} />
      <header className="search-heading">
        <h1>{t('search.title')}</h1>
        <p>{t('search.description')}</p>
      </header>
      <div className="search-layout">
        <aside className="search-filters hc-card" aria-labelledby="search-filters-title">
          <h2 id="search-filters-title"><i className="bi bi-sliders" aria-hidden="true" /> {t('search.filters_title')}</h2>
          <form onSubmit={handleSearch} noValidate>
            <div className="search-field search-full-width">
              <label htmlFor="search-keyword" className="form-label">{t('search.keyword')}</label>
              <input id="search-keyword" type="search" className="form-control" value={query} maxLength={150}
                onChange={event => updateFilter('q', event.target.value)} placeholder={t('search.keyword_placeholder')} />
            </div>
            <div className="search-field">
              <label htmlFor="search-gender" className="form-label">{t('search.gender')}</label>
              <select id="search-gender" className="form-select" value={gender}
                onChange={event => updateFilter('gender', event.target.value, 'all')}>
                <option value="all">{t('common.all')}</option>
                <option value="male">{t('common.male')}</option>
                <option value="female">{t('common.female')}</option>
                <option value="other">{t('common.other')}</option>
              </select>
            </div>
            <div className="search-field">
              <label htmlFor="search-status" className="form-label">{t('search.status')}</label>
              <select id="search-status" className="form-select" value={onlineStatus}
                onChange={event => updateFilter('onlineStatus', event.target.value, 'all')}>
                <option value="all">{t('common.all')}</option>
                <option value="online">{t('search.online_only')}</option>
                <option value="offline">{t('search.offline_only')}</option>
              </select>
            </div>
            <fieldset className="search-field search-full-width">
              <legend className="form-label">{t('search.age_range')}</legend>
              <div className="search-age-inputs">
                <div>
                  <label htmlFor="search-age-min">{t('search.age_min')}</label>
                  <input id="search-age-min" type="number" inputMode="numeric" className="form-control" min={18} max={100} step={1}
                    value={ageMin} placeholder="18" onChange={event => updateFilter('ageMin', event.target.value)}
                    aria-invalid={!validAges} aria-describedby={!validAges ? 'search-validation' : undefined} />
                </div>
                <span aria-hidden="true">–</span>
                <div>
                  <label htmlFor="search-age-max">{t('search.age_max')}</label>
                  <input id="search-age-max" type="number" inputMode="numeric" className="form-control" min={18} max={100} step={1}
                    value={ageMax} placeholder="100" onChange={event => updateFilter('ageMax', event.target.value)}
                    aria-invalid={!validAges} aria-describedby={!validAges ? 'search-validation' : undefined} />
                </div>
              </div>
              <p className="search-age-hint">{t('search.age_hint')}</p>
            </fieldset>
            {validationError && <p id="search-validation" className="search-validation search-full-width" role="alert">{validationError}</p>}
            <div className="search-filter-actions search-full-width">
              <Button type="submit" icon="bi-search" disabled={!!validationError}>{t('common.search')}</Button>
              <Button type="button" variant="outline-secondary" onClick={handleClear}>{t('search.clear_filters')}</Button>
            </div>
          </form>
        </aside>

        <section className="search-results hc-card" aria-labelledby="search-results-title" aria-busy={isSearching}>
          <div className="search-results-heading">
            <h2 id="search-results-title">{t('search.results_title')}</h2>
            {!isSearching && !validationError && !searchFailed && <span role="status">{t('search.results_count', { count: results.length })}</span>}
          </div>
          {validationError ? (
            <EmptyState icon="bi bi-sliders" title={t('search.check_filters')} description={validationError} />
          ) : isSearching ? (
            <Loading text={t('search.searching')} />
          ) : searchFailed ? (
            <div role="alert">
              <EmptyState icon="bi bi-exclamation-circle" title={t('search.load_error')} description={t('search.load_error_desc')}
                actionLabel={t('search.retry')} onAction={retrySearch} />
            </div>
          ) : results.length ? (
            <div className="search-results-grid">
              {results.map(profile => <UserCard key={profile.id} user={profile} onClick={() => {
                if (!user) setShowAuthModal(true);
                else navigate(`/profile/${encodeURIComponent(profile.username || profile.id)}`);
              }} />)}
            </div>
          ) : (
            <EmptyState icon="bi bi-search" title={t('search.no_results')} description={t('search.no_results_desc')}
              actionLabel={page > 1 ? t('search.first_page') : t('search.clear_filters')}
              onAction={page > 1 ? () => changePage(1) : handleClear} />
          )}
          {!validationError && !searchFailed && (page > 1 || hasMore) && (
            <nav className="search-pagination" aria-label={t('search.pagination')}>
              <Button variant="outline-secondary" disabled={page === 1 || isSearching} onClick={() => changePage(page - 1)}>{t('search.previous')}</Button>
              <span>{t('search.page', { page })}</span>
              <Button variant="outline-secondary" disabled={!hasMore || isSearching} onClick={() => changePage(page + 1)}>{t('search.next')}</Button>
            </nav>
          )}
        </section>
      </div>
      <AuthPromptModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)}
        title={t('auth_prompt.title')} description={t('auth_prompt.desc')} />
    </div>
  );
};

export default SearchView;
