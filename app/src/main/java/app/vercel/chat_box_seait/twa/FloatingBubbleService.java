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
        if (intent != null && intent.hasExtra("avatarUrl")) {
            String avatarUrl = intent.getStringExtra("avatarUrl");
            String message = intent.getStringExtra("message");
            showBubble(avatarUrl, message);
        }
        return START_STICKY;
    }

    private void showBubble(String avatarUrl, String message) {
        if (floatingView != null) {
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

        windowManager.addView(floatingView, params);
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
