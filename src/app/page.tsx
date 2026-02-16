"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  User,
} from "@supabase/supabase-js";
import { supabase, type Bookmark } from "@/lib/supabaseClient";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        if (!cancelled) {
          setError(error.message);
        }
        return;
      }

      if (!cancelled) {
        setUser(data.user ?? null);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);

      if (!session?.user) {
        setBookmarks([]);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      return;
    }

    const userId = user.id;

    let cancelled = false;

    async function loadBookmarks() {
      setLoadingBookmarks(true);
      setError(null);

      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        if (!cancelled) {
          setError(error.message);
        }
        setLoadingBookmarks(false);
        return;
      }

      if (!cancelled && data) {
        setBookmarks(data as Bookmark[]);
        setLoadingBookmarks(false);
      }
    }

    loadBookmarks();

    const channel = supabase
      .channel(`bookmarks-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookmarks",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<Bookmark>) => {
          if (payload.eventType === "INSERT") {
            const record = payload.new;
            setBookmarks((current) => {
              const exists = current.some((b) => b.id === record.id);
              if (exists) {
                return current;
              }
              return [record, ...current];
            });
          }

          if (payload.eventType === "DELETE") {
            const record = payload.old;
            setBookmarks((current) =>
              current.filter((bookmark) => bookmark.id !== record.id),
            );
          }

          if (payload.eventType === "UPDATE") {
            const record = payload.new;
            setBookmarks((current) =>
              current.map((bookmark) =>
                bookmark.id === record.id ? record : bookmark,
              ),
            );
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id]);

  async function handleSignIn() {
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });

    if (error) {
      setError(error.message);
    }
  }

  async function handleSignOut() {
    setError(null);
    await supabase.auth.signOut();
  }

  async function handleAddBookmark(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError("You must be signed in to add bookmarks.");
      return;
    }

    if (!url.trim()) {
      setError("URL is required.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("bookmarks").insert({
      user_id: user.id,
      url: url.trim(),
      title: title.trim() || url.trim(),
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setUrl("");
    setTitle("");
  }

  async function handleDeleteBookmark(id: string) {
    if (!user) {
      setError("You must be signed in to delete bookmarks.");
      return;
    }

    setError(null);

    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      setError(error.message);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            Smart Bookmark
          </h1>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-zinc-600 sm:inline">
                {user.email}
              </span>
            )}
            {user ? (
              <button
                onClick={handleSignOut}
                className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-100"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                className="rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {user ? (
          <>
            <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Add bookmark
              </h2>
              <form
                onSubmit={handleAddBookmark}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <div className="flex-1 space-y-2">
                  <input
                    type="url"
                    required
                    placeholder="https://example.com"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                  <input
                    type="text"
                    placeholder="Optional title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-2 h-[42px] rounded-lg bg-black px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 sm:mt-0 sm:self-end"
                >
                  {saving ? "Saving..." : "Add"}
                </button>
              </form>
            </section>

            <section className="flex-1 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                  Your bookmarks
                </h2>
                {loadingBookmarks && (
                  <span className="text-xs text-zinc-500">Loading…</span>
                )}
              </div>

              {bookmarks.length === 0 && !loadingBookmarks ? (
                <p className="text-sm text-zinc-500">
                  No bookmarks yet. Add your first one above.
                </p>
              ) : (
                <ul className="space-y-2">
                  {bookmarks.map((bookmark) => (
                    <li
                      key={bookmark.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <a
                          href={bookmark.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-zinc-900 hover:underline"
                        >
                          {bookmark.title || bookmark.url}
                        </a>
                        <p className="truncate text-xs text-zinc-500">
                          {bookmark.url}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteBookmark(bookmark.id)}
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-xl font-semibold tracking-tight">
              Sign in to manage your bookmarks
            </h2>
            <p className="max-w-md text-sm text-zinc-600">
              Use your Google account to create a private, real-time list of
              bookmarks that stays in sync across tabs.
            </p>
            <button
              onClick={handleSignIn}
              className="mt-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
            >
              Sign in with Google
            </button>
          </main>
        )}

        <footer className="mt-8 text-center text-xs text-zinc-400">
          Built with Next.js, Supabase, and Tailwind CSS.
        </footer>
      </div>
    </div>
  );
}
