package app.vercel.chat_box_seait.twa;

import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.InputStream;
import java.net.URL;

public class FloatingBubbleService extends Service {

    private WindowManager windowManager;
    private View chatHeadView;
    private WindowManager.LayoutParams params;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("profileUrl")) {
            String url = intent.getStringExtra("profileUrl");
            String text = intent.getStringExtra("text");
            showBubble(url, text);
        }
        return START_NOT_STICKY;
    }

    private void showBubble(String profileUrl, String text) {
        if (chatHeadView != null) {
            updateBadge();
            return;
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        chatHeadView = LayoutInflater.from(this).inflate(R.layout.floating_chat_head, null);

        // Window Layout Params
        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 100;
        params.y = 100;

        // Load Profile Image
        final ImageView profileImage = chatHeadView.findViewById(R.id.chat_head_profile);
        new Thread(() -> {
            try {
                InputStream in = new URL(profileUrl).openStream();
                final Bitmap bitmap = BitmapFactory.decodeStream(in);
                new Handler(Looper.getMainLooper()).post(() -> profileImage.setImageBitmap(bitmap));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();

        // Dragging Logic
        chatHeadView.setOnTouchListener(new View.OnTouchListener() {
            private int lastAction;
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
                        lastAction = MotionEvent.ACTION_DOWN;
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (lastAction == MotionEvent.ACTION_DOWN) {
                            // Clicked -> Open App
                            Intent intent = new Intent(FloatingBubbleService.this, LauncherActivity.class);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            stopSelf();
                        }
                        lastAction = MotionEvent.ACTION_UP;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(chatHeadView, params);
                        lastAction = MotionEvent.ACTION_MOVE;
                        return true;
                }
                return false;
            }
        });

        windowManager.addView(chatHeadView, params);
    }

    private void updateBadge() {
        TextView badge = chatHeadView.findViewById(R.id.chat_head_badge);
        badge.setVisibility(View.VISIBLE);
        int count = Integer.parseInt(badge.getText().toString());
        badge.setText(String.valueOf(count + 1));
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (chatHeadView != null) windowManager.removeView(chatHeadView);
    }
}
