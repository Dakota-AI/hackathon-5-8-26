import 'dart:async';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'background_reply.dart';

/// Local-notification wrapper. Single instance, owned by [App].
///
/// Banners only fire when the chat is *not* in the foreground. When the
/// app is foregrounded, the chat surface handles the visual entry
/// animation + haptic itself.
class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  static const _agentCategory = 'agent_reply';
  static const _replyActionId = 'reply_inline';

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  bool _chatVisible = false;
  bool _voiceVisible = false;

  /// Stream of `payload` strings from plain notification taps.
  final _onTapped = StreamController<String?>.broadcast();
  Stream<String?> get onTapped => _onTapped.stream;

  /// Stream of inline replies submitted from the notification's text
  /// input action. The chat surface listens here and routes each reply
  /// to ConversationStore.sendUser.
  final _onReply = StreamController<String>.broadcast();
  Stream<String> get onReply => _onReply.stream;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // Init timezone data so zonedSchedule can fire at OS level even
    // while the app is suspended.
    tzdata.initializeTimeZones();
    try {
      final name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (e) {
      safePrint('[notif] timezone setup failed: $e — falling back to UTC');
    }

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    final darwinInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
      notificationCategories: [
        DarwinNotificationCategory(
          _agentCategory,
          actions: [
            // No `foreground` option — submitting the inline reply must
            // NOT bring the app to foreground. The reply is dispatched
            // from a background isolate and the agent's response comes
            // back as another banner.
            DarwinNotificationAction.text(
              _replyActionId,
              'Reply',
              buttonTitle: 'Send',
              placeholder: 'Reply to the agent…',
            ),
          ],
          options: const {
            DarwinNotificationCategoryOption.hiddenPreviewShowTitle,
          },
        ),
      ],
    );

    await _plugin.initialize(
      InitializationSettings(
        android: androidInit,
        iOS: darwinInit,
        // macOS uses the same Darwin settings; passing iOS only causes the
        // plugin to throw "macOS settings must be set when targeting macOS".
        macOS: darwinInit,
      ),
      onDidReceiveNotificationResponse: _handleResponse,
      onDidReceiveBackgroundNotificationResponse: backgroundReplyHandler,
    );

    // Permissions: ask once. iOS only; Android handles via system.
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      final granted = await ios?.requestPermissions(
        alert: true,
        badge: true,
        sound: true,
      );
      safePrint('[notif] iOS permissions granted=$granted');
    }
  }

  void _handleResponse(NotificationResponse response) {
    safePrint(
      '[notif] response type=${response.notificationResponseType} '
      'action=${response.actionId} payload=${response.payload} '
      'inputLen=${response.input?.length ?? 0}',
    );
    if (response.notificationResponseType ==
            NotificationResponseType.selectedNotificationAction &&
        response.actionId == _replyActionId) {
      final reply = response.input?.trim() ?? '';
      if (reply.isNotEmpty) _onReply.add(reply);
      return;
    }
    _onTapped.add(response.payload);
  }

  /// Tells the service whether the chat surface is currently in
  /// foreground. While true, banners are suppressed (the chat's own
  /// entry animation is enough).
  void setChatVisible(bool visible) {
    _chatVisible = visible;
  }

  void setVoiceVisible(bool visible) {
    _voiceVisible = visible;
  }

  /// Show a proactive-message banner. No-op when the chat is in the
  /// foreground, the voice surface is open (audio is the notification
  /// there), or the app is not yet initialised.
  Future<void> showProactive({
    required String body,
    String title = 'AI Caller',
    String payload = 'open-chat',
  }) async {
    if (!_initialized) return;
    if (_chatVisible) {
      safePrint('[notif] suppressed (chat foreground)');
      return;
    }
    if (_voiceVisible) {
      safePrint('[notif] suppressed (voice mode foreground)');
      return;
    }
    final id = DateTime.now().millisecondsSinceEpoch.remainder(1 << 31);
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          interruptionLevel: InterruptionLevel.active,
          categoryIdentifier: _agentCategory,
        ),
        android: AndroidNotificationDetails(
          'aicaller_agent',
          'Agent messages',
          channelDescription: 'Proactive messages from the AI agent',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: payload,
    );
    safePrint('[notif] showed proactive banner id=$id');
  }

  /// Schedule a proactive banner to fire after [after] delay. iOS handles
  /// the schedule at the OS level via `UNTimeIntervalNotificationTrigger`,
  /// so it works even when the app is suspended or killed.
  ///
  /// Banner is suppressed at fire time only by iOS itself (e.g. Focus / DND).
  /// If the chat surface is foregrounded when it fires, iOS still presents
  /// — that's intentional for delayed pings (the user opted into the
  /// banner by tapping the bell).
  Future<void> scheduleProactive({
    required String body,
    required Duration after,
    String title = 'AI Caller',
    String payload = 'open-chat',
  }) async {
    if (!_initialized) return;
    final fireAt = tz.TZDateTime.now(tz.local).add(after);
    final id = DateTime.now().millisecondsSinceEpoch.remainder(1 << 31);
    await _plugin.zonedSchedule(
      id,
      title,
      body,
      fireAt,
      const NotificationDetails(
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          interruptionLevel: InterruptionLevel.active,
          categoryIdentifier: _agentCategory,
        ),
        android: AndroidNotificationDetails(
          'aicaller_agent',
          'Agent messages',
          channelDescription: 'Proactive messages from the AI agent',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: payload,
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
    );
    safePrint('[notif] scheduled banner id=$id fireAt=$fireAt');
    final pending = await _plugin.pendingNotificationRequests();
    safePrint('[notif] pending count=${pending.length}');
  }

  /// Diagnostic: fire a banner immediately with hardcoded text. Useful
  /// for ruling out the LLM/scheduling stages when the OS isn't showing
  /// notifications. Long-press the bell triggers this.
  Future<void> testFireNow() async {
    if (!_initialized) {
      safePrint('[notif] testFireNow: not initialized');
      return;
    }
    await showProactive(
      body: 'Diagnostic banner — if you see this, notification plumbing works.',
    );
  }

  Future<void> dispose() async {
    await _onTapped.close();
    await _onReply.close();
  }
}
