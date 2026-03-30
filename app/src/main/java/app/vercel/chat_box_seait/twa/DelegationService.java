package app.vercel.chat_box_seait.twa;



import android.app.Notification;
import android.content.Intent;
import android.util.Log;

public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();

        
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId, Notification notification, String channelName) {
        Log.d("ChatBox", "Native Notification Interception Hit!");
        
        try {
            if (notification != null && notification.extras != null) {
                String title = notification.extras.getString(Notification.EXTRA_TITLE);
                String message = notification.extras.getString(Notification.EXTRA_TEXT);
                
                // If it looks like a chat message from Web
                if (title != null && message != null) {
                    Intent serviceIntent = new Intent(this, FloatingBubbleService.class);
                    // Pass message data to bubble
                    serviceIntent.putExtra("message", message);
                    // Avatar URL is downloaded as a raw Bitmap by Chrome. 
                    // Pass empty so it falls back to default icon for now
                    serviceIntent.putExtra("avatarUrl", ""); 
                    
                    androidx.core.content.ContextCompat.startForegroundService(this, serviceIntent);
                    Log.d("ChatBox", "FloatingBubbleService triggered from Native Intercept!");
                }
            }
        } catch (Exception e) {
            Log.e("ChatBox", "Error intercepting notification", e);
        }

        return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
    }
}


