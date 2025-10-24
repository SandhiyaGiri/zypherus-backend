import { Router, Response } from 'express';
import { apiKeyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GitHub Release configuration
// TODO: Update these with your actual GitHub repository details
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'SandhiyaGiri';
const GITHUB_REPO = process.env.GITHUB_REPO || 'zypherus-backend';

// SDK version configuration
const SDK_RELEASES = {
  latest: 'v0.0.1',
  versions: {
    'v0.0.1': {
      sdk: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.0.1/zypherus-sdk-0.0.0.tgz`,
      sharedTypes: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.0.1/zypherus-shared-types-0.0.0.tgz`,
    },
  },
};

// Get SDK download link with tracking (requires API key authentication)
router.get('/download/:version?', apiKeyAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { version = 'latest' } = req.params;
  const packageName = (req.query.package as string) || 'sdk';
  
  // Resolve version
  const resolvedVersion = version === 'latest' ? SDK_RELEASES.latest : version;
  const releaseInfo = SDK_RELEASES.versions[resolvedVersion as keyof typeof SDK_RELEASES.versions];
  
  if (!releaseInfo) {
    return res.status(404).json({ 
      error: 'SDK version not found',
      available_versions: Object.keys(SDK_RELEASES.versions),
      latest: SDK_RELEASES.latest
    });
  }
  
  const downloadUrl = packageName === 'shared-types' ? releaseInfo.sharedTypes : releaseInfo.sdk;
  
  // Log download to database
  try {
    await supabase.from('sdk_downloads').insert({
      api_key_id: req.apiKeyData!.id,
      user_id: req.userId,
      sdk_version: resolvedVersion,
      package_name: packageName,
      download_url: downloadUrl,
      ip_address: req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown',
      user_agent: req.headers['user-agent'] || 'unknown',
    });
  } catch (error) {
    console.error('Failed to log SDK download:', error);
    // Don't fail the request if logging fails
  }
  
  // Redirect to GitHub Release download URL
  // GitHub will handle the actual file serving
  res.redirect(302, downloadUrl);
}));

// Get available SDK versions (public endpoint)
router.get('/versions', asyncHandler(async (_req, res: Response) => {
  res.json({
    latest: SDK_RELEASES.latest,
    versions: Object.keys(SDK_RELEASES.versions),
    packages: ['sdk', 'shared-types'],
  });
}));

// Get SDK download statistics (requires API key authentication)
router.get('/stats', apiKeyAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { data: downloads, error } = await supabase
    .from('sdk_downloads')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Failed to fetch SDK stats:', error);
    return res.status(500).json({ error: 'Failed to fetch statistics' });
  }
  
  // Aggregate stats
  const byVersion: Record<string, number> = {};
  const byPackage: Record<string, number> = {};
  
  downloads?.forEach(d => {
    byVersion[d.sdk_version] = (byVersion[d.sdk_version] || 0) + 1;
    byPackage[d.package_name] = (byPackage[d.package_name] || 0) + 1;
  });
  
  const stats = {
    total_downloads: downloads?.length || 0,
    by_version: byVersion,
    by_package: byPackage,
    recent_downloads: downloads?.slice(0, 10).map(d => ({
      version: d.sdk_version,
      package: d.package_name,
      downloaded_at: d.created_at,
      ip_address: d.ip_address,
    })),
  };
  
  res.json(stats);
}));

// Admin endpoint: Get all SDK download statistics
router.get('/admin/stats', apiKeyAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Check if user is admin
  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', req.userId!)
    .single();
  
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Get all downloads
  const { data: downloads, error } = await supabase
    .from('sdk_downloads')
    .select('*, users(email), api_keys(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  
  if (error) {
    console.error('Failed to fetch admin SDK stats:', error);
    return res.status(500).json({ error: 'Failed to fetch statistics' });
  }
  
  // Aggregate stats
  const byVersion: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byPackage: Record<string, number> = {};
  
  downloads?.forEach(d => {
    byVersion[d.sdk_version] = (byVersion[d.sdk_version] || 0) + 1;
    byPackage[d.package_name] = (byPackage[d.package_name] || 0) + 1;
    const userEmail = (d.users as any)?.email || 'unknown';
    byUser[userEmail] = (byUser[userEmail] || 0) + 1;
  });
  
  const stats = {
    total_downloads: downloads?.length || 0,
    by_version: byVersion,
    by_package: byPackage,
    by_user: byUser,
    recent_downloads: downloads?.slice(0, 20).map(d => ({
      user_email: (d.users as any)?.email,
      api_key_name: (d.api_keys as any)?.name,
      version: d.sdk_version,
      package: d.package_name,
      downloaded_at: d.created_at,
      ip_address: d.ip_address,
    })),
  };
  
  res.json(stats);
}));

export default router;

