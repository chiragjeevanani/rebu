import React from 'react';
import { Alert } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Camera, Images } from 'lucide-react-native';
import Sheet from './Sheet';
import ListRow from './ListRow';

const OPTIONS = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 1440,
  maxHeight: 1440,
};

/** "Add photo" chooser: camera or gallery. Calls onPicked(uri) on success. */
export default function PhotoSourceSheet({ visible, onClose, onPicked }) {
  const pick = async launcher => {
    onClose();
    // Let the sheet finish closing before handing off to the camera/gallery.
    await new Promise(r => setTimeout(r, 350));
    const res = await launcher(OPTIONS);
    if (res.didCancel) return;
    if (res.errorCode) {
      Alert.alert('Couldn’t add photo', res.errorMessage || res.errorCode);
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (uri) onPicked(uri);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add photo">
      <ListRow
        icon={Camera}
        title="Take a photo"
        subtitle="Use your camera"
        onPress={() => pick(launchCamera)}
      />
      <ListRow
        icon={Images}
        title="Choose from gallery"
        subtitle="Pick an existing photo"
        last
        onPress={() => pick(launchImageLibrary)}
      />
    </Sheet>
  );
}
