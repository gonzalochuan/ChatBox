package app.vercel.chat_box_seait.twa;

import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;
import com.bumptech.glide.Glide;

public class FloatingBubbleService extends Service {
    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams params;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d("ChatBox", "🔥 SERVICE STARTED");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "chathead_channel";
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                    channelId,
                    "Chat Heads",
                    android.app.NotificationManager.IMPORTANCE_LOW
            );
            
            android.app.NotificationManager manager = getSystemService(android.app.NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
            
            android.app.Notification notification = new android.app.Notification.Builder(this, channelId)
                    .setContentTitle("ChatBox Active")
                    .setContentText("Listening for messages...")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .build();
            
            startForeground(1, notification);
        }

        if (intent != null) {
            boolean isRealMessage = intent.hasExtra("message") || intent.hasExtra("avatarUrl");
            if (isRealMessage) {
                String avatarUrl = intent.hasExtra("avatarUrl") ? intent.getStringExtra("avatarUrl") : "";
                String message = intent.hasExtra("message") ? intent.getStringExtra("message") : "";
                showBubble(avatarUrl, message);
            } else {
                Log.d("ChatBox", "🔥 ANCHOR ONLY - Background Service locked & listening.");
            }
        }
        return START_STICKY;
    }

    private void showBubble(String avatarUrl, String message) {
        Log.d("ChatBox", "🔥 showBubble CALLED");
        Log.d("ChatBox", "Overlay: " + android.provider.Settings.canDrawOverlays(this));
        
        if (!android.provider.Settings.canDrawOverlays(this)) {
            Log.e("ChatBox", "Cannot draw overlays. User has not granted permission.");
            return;
        }

        if (floatingView != null) {
            Log.d("ChatBox", "🔥 View already exists, updating badge");
            updateBadge();
            return;
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        floatingView = LayoutInflater.from(this).inflate(R.layout.floating_chat_head, null);

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ?
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY :
                        WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 100;
        params.y = 100;

        ImageView profileImage = floatingView.findViewById(R.id.item_profile_image);
        if (avatarUrl != null && !avatarUrl.isEmpty()) {
            Glide.with(this).load(avatarUrl).circleCrop().into(profileImage);
        }

        floatingView.findViewById(R.id.chat_head_root).setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(floatingView, params);
                        return true;
                    case MotionEvent.ACTION_UP:
                        float deltaX = event.getRawX() - initialTouchX;
                        float deltaY = event.getRawY() - initialTouchY;
                        if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
                            openApp();
                        }
                        return true;
                }
                return false;
            }
        });

        Log.d("ChatBox", "🔥 ADDING VIEW (RED BOX ISOLATION TEST)");
        
        // --- RED BOX TEST INJECTION ---
        View testView = new View(this);
        testView.setBackgroundColor(android.graphics.Color.RED);
        params.width = 300;
        params.height = 300;
        
        try {
            windowManager.addView(testView, params);
            Log.d("ChatBox", "🔥 RED BOX ADDED SUCCESSFULLY");
        } catch (Exception e) {
            Log.e("ChatBox", "🔥 CRITICAL FAILURE adding view to WindowManager", e);
        }
        // ------------------------------
    }

    private void updateBadge() {
        TextView badge = floatingView.findViewById(R.id.item_badge);
        badge.setVisibility(View.VISIBLE);
        String countStr = badge.getText().toString();
        int count = Integer.parseInt(countStr.isEmpty() ? "0" : countStr) + 1;
        badge.setText(String.valueOf(count));
    }

    private void openApp() {
        Intent intent = new Intent(this, LauncherActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (floatingView != null) windowManager.removeView(floatingView);
    }
}
