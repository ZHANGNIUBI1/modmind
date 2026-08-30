package top.etherstudio.remote;

import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * Enables Web Push notification delegation: Chrome shows site notifications
 * through this service while the TWA is not running in the foreground.
 */
public class DelegationService extends DelegationService {
}
