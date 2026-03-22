import { getServiceRoleClient } from "@/lib/supabase";

const GRAPH_API = "https://graph.instagram.com";
const GRAPH_FB = "https://graph.facebook.com/v21.0";

export function getInstagramConfig() {
  return {
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    redirectUri: process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI!,
  };
}

export function buildAuthUrl() {
  const { appId, redirectUri } = getInstagramConfig();
  const scopes = "instagram_business_basic,instagram_business_content_publish";
  return (
    `https://www.instagram.com/oauth/authorize?` +
    `client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}&response_type=code&enable_fb_login=0`
  );
}

export async function exchangeCodeForToken(code: string) {
  const { appId, appSecret, redirectUri } = getInstagramConfig();

  const shortRes = await fetch(`${GRAPH_API}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!shortRes.ok) {
    const err = await shortRes.text();
    throw new Error(`Short-lived token exchange failed: ${err}`);
  }
  const shortData = await shortRes.json();
  const shortToken = shortData.access_token;
  const userId = String(shortData.user_id);

  const longRes = await fetch(
    `${GRAPH_API}/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
  );
  if (!longRes.ok) {
    const err = await longRes.text();
    throw new Error(`Long-lived token exchange failed: ${err}`);
  }
  const longData = await longRes.json();

  return {
    accessToken: longData.access_token as string,
    expiresIn: longData.expires_in as number,
    userId,
  };
}

export async function fetchIgProfile(accessToken: string, userId: string) {
  const res = await fetch(
    `${GRAPH_API}/v21.0/${userId}?fields=username,profile_picture_url&access_token=${accessToken}`
  );
  if (!res.ok) return { username: userId, profilePicture: null };
  const data = await res.json();
  return {
    username: data.username ?? userId,
    profilePicture: data.profile_picture_url ?? null,
  };
}

export async function getConnectedAccount() {
  const supabase = getServiceRoleClient();
  const { data } = await supabase
    .from("instagram_accounts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data as {
    id: string;
    ig_user_id: string;
    ig_username: string;
    access_token: string;
    token_expires_at: string;
  } | null;
}

export async function createReelContainer(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
  isTrialReel: boolean,
  graduationStrategy: string = "MANUAL"
) {
  const params: Record<string, string> = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: accessToken,
  };

  if (isTrialReel) {
    params.trial_params = JSON.stringify({ graduation_strategy: graduationStrategy });
  }

  const res = await fetch(`${GRAPH_FB}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.id as string;
}

export async function checkContainerStatus(containerId: string, accessToken: string) {
  const res = await fetch(
    `${GRAPH_FB}/${containerId}?fields=status_code,status&access_token=${accessToken}`
  );
  const data = await res.json();
  return {
    statusCode: data.status_code as string,
    status: data.status as string | undefined,
  };
}

export async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string
) {
  const res = await fetch(`${GRAPH_FB}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.id as string;
}
