import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Camera,
  Check,
  CircleCheck,
  IdCard,
  ScanFace,
  ShieldCheck,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { launchCamera } from 'react-native-image-picker';
import { del, get, post, uploadImage } from '../../api/client';
import { toAppHost } from '../../api/hosts';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Segmented from '../../components/Segmented';
import { Card } from '../../components/ListRow';

/* ---------- Blocked users ---------- */
export function BlockedUsersScreen() {
  const [list, setList] = useState(null);
  useFocusEffect(
    useCallback(() => {
      get('/me/blocked')
        .then(r => setList(r.items))
        .catch(() => setList([]));
    }, []),
  );
  if (!list) {
    return (
      <Screen>
        <Header title="Blocked users" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Header
        title="Blocked users"
        subtitle="They can’t see your profile or contact you"
      />
      <FlatList
        data={list}
        keyExtractor={u => u.id}
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={{ marginTop: 60 }}
          >
            You haven’t blocked anyone.
          </Txt>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar uri={item.photo} size={50} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">{item.name}</Txt>
              <Txt variant="small">
                {item.isHost ? 'Host' : 'User'}
                {item.city ? ` · ${item.city}` : ''}
              </Txt>
            </View>
            <Button
              title="Unblock"
              variant="secondary"
              size="sm"
              full={false}
              onPress={() => {
                setList(l => l.filter(u => u.id !== item.id));
                del(`/me/blocked/${item.id}`).catch(() => {});
              }}
            />
          </View>
        )}
      />
    </Screen>
  );
}

/* ---------- Followers / Following ---------- */
export function FollowersScreen({ route }) {
  const { following, toggleFollow } = useApp();
  const [tab, setTab] = useState(route.params?.tab || 'followers');
  const [lists, setLists] = useState({});
  useFocusEffect(
    useCallback(() => {
      get(`/me/connections?tab=${tab}&limit=100`)
        .then(r => setLists(l => ({ ...l, [tab]: r.items.map(toAppHost) })))
        .catch(() => setLists(l => ({ ...l, [tab]: [] })));
    }, [tab]),
  );
  const data = lists[tab];
  return (
    <Screen>
      <Header title="Connections" />
      <Segmented
        style={{ marginHorizontal: spacing.md, marginBottom: 8 }}
        value={tab}
        onChange={setTab}
        options={[
          { key: 'followers', label: 'Followers' },
          { key: 'following', label: 'Following' },
        ]}
      />
      {!data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : null}
      <FlatList
        data={data || []}
        keyExtractor={u => u.id}
        ListEmptyComponent={
          data ? (
            <Txt
              variant="body"
              color={colors.textMuted}
              center
              style={{ marginTop: 60 }}
            >
              {tab === 'followers'
                ? 'No followers yet.'
                : 'You’re not following anyone yet.'}
            </Txt>
          ) : null
        }
        renderItem={({ item }) => {
          const on = following.includes(item.id);
          return (
            <View style={styles.row}>
              <Avatar uri={item.photo} size={50} online={item.online} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">{item.name}</Txt>
                <Txt variant="small">
                  {item.isHost ? 'Host' : 'User'}
                  {item.age ? ` · ${item.age}` : ''}
                  {item.city ? ` · ${item.city}` : ''}
                </Txt>
              </View>
              <Button
                title={on ? 'Following' : 'Follow'}
                variant={on ? 'secondary' : 'primary'}
                size="sm"
                full={false}
                onPress={() => toggleFollow(item.id)}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}

/* ---------- Report user ---------- */
const REASONS = [
  'Fake profile / scam',
  'Inappropriate photos',
  'Harassment or bullying',
  'Underage user',
  'Spam or advertising',
  'Offensive behaviour on call',
  'Something else',
];

export function ReportScreen({ navigation, route }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { targetType, targetId } = route.params || {};
  const person = targetType === 'user' || targetType === 'host';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (targetId) {
        await post('/reports', {
          targetType,
          targetId,
          reason,
          ...(details.trim() && { details: details.trim() }),
        });
        if (person) await post(`/me/blocked/${targetId}`).catch(() => {});
      }
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.doneWrap}>
          <LinearGradient colors={colors.gradientSoft} style={styles.doneIcon}>
            <CircleCheck size={44} color={colors.success} />
          </LinearGradient>
          <Txt variant="h1" center>
            Thanks for reporting
          </Txt>
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={{ marginTop: 8 }}
          >
            Our safety team will review this within 24 hours.
            {person
              ? ` ${route.params?.name} has been blocked and won’t be able to contact you.`
              : ''}
          </Txt>
        </View>
        <View style={{ padding: spacing.md }}>
          <Button title="Done" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={{ padding: spacing.md }}>
          {error ? (
            <Txt
              variant="small"
              color={colors.danger}
              style={{ marginBottom: 8 }}
            >
              {error}
            </Txt>
          ) : null}
          <Button
            title="Submit report"
            disabled={!reason || busy}
            loading={busy}
            onPress={submit}
          />
        </View>
      }
    >
      <Header
        title={`Report ${route.params?.name || 'user'}`}
        subtitle="Your report is anonymous"
      />
      <View style={{ paddingHorizontal: spacing.md }}>
        <Txt variant="h3" style={{ marginBottom: 12 }}>
          Why are you reporting?
        </Txt>
        {REASONS.map(r => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={[styles.reason, reason === r && styles.reasonActive]}
          >
            <Txt variant="label" style={{ flex: 1 }}>
              {r}
            </Txt>
            <View style={[styles.radio, reason === r && styles.radioOn]}>
              {reason === r ? (
                <Check size={13} color={colors.white} strokeWidth={3} />
              ) : null}
            </View>
          </Pressable>
        ))}
        <Input
          label="Additional details (optional)"
          multiline
          value={details}
          onChangeText={setDetails}
          placeholder="Tell us what happened…"
          style={{ marginTop: 10 }}
        />
      </View>
    </Screen>
  );
}

/* ---------- Verification ---------- */
export function VerificationScreen({ navigation }) {
  const { user, refreshMe } = useApp();
  const verified = user.verified;
  const pending = user.server?.verification?.status === 'pending';
  const rejected = user.server?.verification?.status === 'rejected';
  // 0 take selfie · 1 waiting for review · 3 verified (all steps done)
  const step = verified ? 3 : pending ? 1 : 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const takeSelfie = async () => {
    setError('');
    const r = await launchCamera({
      mediaType: 'photo',
      cameraType: 'front',
      quality: 0.7,
      maxWidth: 1080,
      maxHeight: 1080,
      saveToPhotos: false,
    });
    const uri = r.assets?.[0]?.uri;
    if (!uri) return;
    setBusy(true);
    try {
      const url = await uploadImage(uri);
      await post('/me/verification', { selfie: url });
      await refreshMe();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const steps = [
    {
      icon: ScanFace,
      title: 'Take a selfie',
      body: 'Copy the pose shown on screen so we can match it with your photos.',
    },
    {
      icon: IdCard,
      title: 'Safety team review',
      body: 'We compare your selfie with your profile photos, usually within 24 hours.',
    },
    {
      icon: ShieldCheck,
      title: 'Get your blue tick',
      body: 'Verified profiles show a blue tick, so people know you’re real.',
    },
  ];
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Profile verification" />
      <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
        <LinearGradient
          colors={['#1C1C1E', '#1C1C1E']}
          style={styles.verifyHero}
        >
          <View style={styles.selfieFrame}>
            <Camera size={40} color={colors.white} />
          </View>
          <Txt style={styles.verifyTitle}>
            {verified
              ? 'You’re verified ✅'
              : pending
              ? 'Selfie under review'
              : 'Show everyone you’re real'}
          </Txt>
          <Txt style={styles.verifySub}>
            {verified
              ? 'Your profile shows the blue tick'
              : pending
              ? 'We’ll notify you when it’s done'
              : rejected
              ? 'Last selfie didn’t match — try again in good light'
              : 'Takes less than a minute'}
          </Txt>
        </LinearGradient>
        {steps.map((s, i) => (
          <Card
            key={s.title}
            style={[
              styles.stepCard,
              i <= step && { borderColor: colors.primary },
            ]}
          >
            <View
              style={[
                styles.stepIcon,
                i < step && { backgroundColor: colors.success },
              ]}
            >
              {i < step ? (
                <Check size={18} color={colors.white} />
              ) : (
                <s.icon size={20} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{s.title}</Txt>
              <Txt variant="small">{s.body}</Txt>
            </View>
          </Card>
        ))}
      </View>
      <View style={{ padding: spacing.md }}>
        {error ? (
          <Txt
            variant="small"
            color={colors.danger}
            style={{ marginBottom: 8 }}
          >
            {error}
          </Txt>
        ) : null}
        <Button
          title={step >= 1 ? 'Done' : 'Take a selfie'}
          icon={step >= 1 ? undefined : Camera}
          loading={busy}
          disabled={busy}
          onPress={() => (step >= 1 ? navigation.goBack() : takeSelfie())}
        />
      </View>
    </Screen>
  );
}

/* ---------- Dynamic content pages (managed from admin panel) ---------- */
const CONTENT = {
  help: {
    title: 'Help & support',
    sections: [
      [
        'How do coins work?',
        'Coins are used for audio/video calls (charged per minute), sending gifts and unlocking premium features. Recharge any time from your wallet.',
      ],
      [
        'How do I become a host?',
        'Hosting is open to women only. Go to Profile → Become a host, complete verification and join an agency or apply directly. Hosts earn from calls, chats and gifts.',
      ],
      [
        'When are withdrawals processed?',
        'Withdrawals are processed within 24–48 hours to your bank account or UPI after admin approval.',
      ],
      [
        'Contact us',
        'Email support@rebu.app or call +91 76918 10506 (10 AM – 7 PM).',
      ],
    ],
  },
  terms: {
    title: 'Terms of service',
    sections: [
      ['1. Eligibility', 'You must be 18 years or older to use REBU.'],
      [
        '2. Your account',
        'You are responsible for activity on your account and for keeping your login secure.',
      ],
      [
        '3. Coins & payments',
        'Coins are non-refundable and have no cash value outside REBU, except host earnings withdrawn per the host policy.',
      ],
      [
        '4. Content',
        'You must not upload content that is illegal, explicit or infringes others’ rights.',
      ],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    sections: [
      [
        'What we collect',
        'Your phone number or email, profile details and photos, messages, gifts and call history, purchases, and for hosts their verification and payout details. Calls and lives are not recorded. We don’t access your location, contacts or files.',
      ],
      [
        'How we use it',
        'To run your account, connect calls, chats and lives, charge coins and pay hosts, verify hosts and keep REBU safe. We don’t sell your data or show third-party ads.',
      ],
      [
        'Your controls',
        'Edit your profile, block or report anyone, and delete your account in Settings. Full policy: rebu.live/privacy.html',
      ],
    ],
  },
  guidelines: {
    title: 'Community guidelines',
    sections: [
      [
        'Be respectful',
        'Harassment, hate speech and threats lead to a permanent ban.',
      ],
      ['Be real', 'Use your own recent photos. No impersonation.'],
      [
        'Keep it safe',
        'No nudity or sexual content on calls. Calls may be moderated.',
      ],
    ],
  },
  credits: {
    title: 'Gift artwork credits',
    sections: [
      [
        'About the gifts',
        'REBU’s gifts are 3D renders made for REBU. Some are our own models; the rest use the 3D models below, credited to their authors as their licences ask.',
      ],
      ["Rose", "By alban · CC BY 4.0 · https://sketchfab.com/3d-models/none-fba071e7dece4d3c9dde49a0b8b64c0e"],
      ["Bouquet of red roses", "By alex.yefremov · CC BY 4.0 · https://sketchfab.com/3d-models/none-782946d280c647578b56af668f73f5f4"],
      ["Tulips bouquet", "By alban · CC BY 4.0 · https://sketchfab.com/3d-models/none-2bb621c42485443fa87e19badff916e4"],
      ["Sunflower", "By zvanstone · CC BY 4.0 · https://sketchfab.com/3d-models/none-3a9514b8df044abe809432201b8f1c6e"],
      ["Craft Teddy Bear Photogrammetry", "By Hannah Eliason · CC BY 4.0 · https://sketchfab.com/3d-models/none-cb81496a28ba423eb5e3bd2149143bc8"],
      ["BUTTERFLY", "By Rukh3D · CC BY 4.0 · https://sketchfab.com/3d-models/none-d642db74a3fa491a8143bd088b408094"],
      ["Голубь римский белый | Dove Roman white", "By darwinmuseum.ru · CC0 (public domain) · https://sketchfab.com/3d-models/none-cc36e7c5445a4270b301f7ef938e671a"],
      ["Red High-Heel Shoes", "By MartinMaH · CC BY 4.0 · https://sketchfab.com/3d-models/none-33805e7cc2804ea4bab58a5147b4badc"],
      ["ATOM Shopping Handbag", "By ATOM · CC BY 4.0 · https://sketchfab.com/3d-models/none-4bedaea868b84e33a8b6b7ddecfbb51d"],
      ["Aviator sunglasses", "By Kimppo · CC BY 4.0 · https://sketchfab.com/3d-models/none-00d1cb5aa82745228a3b764c97f867de"],
      ["Wrist Watch", "By Vighnesh Naidu · CC BY 4.0 · https://sketchfab.com/3d-models/none-cd471b55a205468ba87a2e8494a99746"],
      ["ICECREAM", "By gelmi.com.br · CC BY 4.0 · https://sketchfab.com/3d-models/none-8d283399dde7478f8aa977b48a427c36"],
      ["Extra Chocolate Marshmallow Cupcake", "By jtressle · CC BY 4.0 · https://sketchfab.com/3d-models/none-43b8a378e7a74898855fe0075215aa48"],
      ["Evening Red Dress", "By samsikua · CC BY 4.0 · https://sketchfab.com/3d-models/none-0e8acea5f2a14f08947837001bb0992d"],
      ["Plush Unicorn", "By C.U.V · CC BY 4.0 · https://sketchfab.com/3d-models/none-fd6f044ab8164a7e947f69fbe58435ee"],
      ["Hand Painted Stylized Coconut Palm Tree Island", "By Kigha · CC BY 4.0 · https://sketchfab.com/3d-models/none-0935d409de024174b2a231b47263a7cd"],
      ["Fantastic castle", "By lepkarepka · CC BY 4.0 · https://sketchfab.com/3d-models/none-08a018e4e7b3486dbec7b0341be3aeb4"],
      ["Fictional supercar - V12 Goblin", "By ollitei · CC BY 4.0 · https://sketchfab.com/3d-models/none-0a20e49ad5774d778567cb5c3f345786"],
      ["Clio", "By Gman The Cruise Dude · CC BY 4.0 · https://sketchfab.com/3d-models/none-306ef5879ba44031851be0555b80484d"],
      ["Hot Air Balloon", "By Anton Krupnov · CC BY 4.0 · https://sketchfab.com/3d-models/none-0794a171bc7d45949a8bd5f13ab3dd71"],
      ["private jet - with inside - comment - download", "By Marco Fischer · CC BY 4.0 · https://sketchfab.com/3d-models/none-9dd87793b8f2435bbe0cdc6fca5d69da"],
      ["Cruise Ship", "By farhad.Guli · CC BY 4.0 · https://sketchfab.com/3d-models/none-bb782326932e4c179e34f3d6c8e36b86"],
      ["Toy Rocket 4K Free 3D model", "By Desertsage · CC BY 4.0 · https://sketchfab.com/3d-models/none-eeca5464cafe42fd9ae35b2451c14858"],
      ["CC0 - UFO", "By plaggy · CC BY 4.0 · https://sketchfab.com/3d-models/none-5d271445ab5d4928ad44f82a0aff28be"],
      ["Taj Mahal", "By sudhanshum024 · CC BY 4.0 · https://sketchfab.com/3d-models/none-0d884b236a60477f82906ca7cece20ac"],
      ["Peacock feather v.3 pluma pavo real 3d free", "By Roberto Domínguez · CC BY 4.0 · https://sketchfab.com/3d-models/none-85b2ccb8791f4500ba801c31a9b8269e"],
      ["Tabla (Bayan)", "By 868nabeel · CC BY 4.0 · https://sketchfab.com/3d-models/none-845a0214c8a74949bd55511b1dc26cc2"],
      ["Old Chinese Lantern - lowpoly for free download", "By Scritta · CC BY 4.0 · https://sketchfab.com/3d-models/none-73b1e60901e6494fb0cb39affca6f850"],
      ["Perfume Bottle", "By Michaela Blanchfield · CC BY 4.0 · https://sketchfab.com/3d-models/none-7fb074117e104c5280e7360bce962267"],
      ["Lipstick", "By riach · CC BY 4.0 · https://sketchfab.com/3d-models/none-3a22a4359df74375a297d962926f0359"],
      ["Bottle of Champagne", "By Sirolalo · CC BY 4.0 · https://sketchfab.com/3d-models/none-a3947c1c74484bc2940e60ffd2e84b9a"],
      ["A royal crown – a prop", "By Virtual Museums of Małopolska · CC0 (public domain) · https://sketchfab.com/3d-models/none-fcd365eacab747d58b8a54ccd178bcb4"],
      ["Golden Trophy", "By Incg5764 · CC BY 4.0 · https://sketchfab.com/3d-models/none-79389eecca164e27a75d362fbbecfe3b"],
      ["Heart-Box Chocolates", "By Brian Trepanier · CC BY 4.0 · https://sketchfab.com/3d-models/none-ea2014c39b9946f18362b26618369909"],
      ["Heart-Shaped Chocolate Box 3D Model", "By qanitaarif0207 · CC BY 4.0 · https://sketchfab.com/3d-models/none-2ceec37053284fb6b83f298768099449"],
      ["Coffee Cup", "By AK STUDIO · CC BY 4.0 · https://sketchfab.com/3d-models/none-992750b0df674378989fa915b0688ce1"],
      ["Lollipop popop", "By arast2517 · CC BY 4.0 · https://sketchfab.com/3d-models/none-3071e2c6382842509b17f2535224444d"],
      ["PUMPING HEART MODEL", "By omarelone · CC BY 4.0 · https://sketchfab.com/3d-models/none-6f815b9822dc479eae0a17b8dcab9c75"],
      ["CC0 - Wax Seal 2", "By plaggy · CC BY 4.0 · https://sketchfab.com/3d-models/none-bd18fd7b6c1847bc8e7d9e779c122ed5"],
      ["Hair Bow, Hair Ribbon", "By Rauschkugel · CC BY 4.0 · https://sketchfab.com/3d-models/none-388dc49d323d42fdbd08e53021c10e82"],
      ["Gold Glitter Star", "By Johana-PS · CC BY 4.0 · https://sketchfab.com/3d-models/none-1f04c82e37e54de88bb01302a642b998"],
      ["Golden Crescent with Ramadan Pattern", "By haero · CC BY 4.0 · https://sketchfab.com/3d-models/none-4b1a895a1b19490d915747174e99ba86"],
      ["Saturn (planet)", "By SebastianSosnowski · CC BY 4.0 · https://sketchfab.com/3d-models/none-9ab1eb3bb97f4e4a9305c0aae2d280a6"],
      ["Festive Firecracker", "By farooq.smurf · CC BY 4.0 · https://sketchfab.com/3d-models/none-afdeba9d18be43eeadf361daee165c68"],
      ["Hindu Temple Bell", "By Rush At Games · CC BY 4.0 · https://sketchfab.com/3d-models/none-fd30810e3fa84866b1b4f767c083ea6d"],
      ["Fireworks", "By Kroko.blend · CC BY 4.0 · https://sketchfab.com/3d-models/none-ed838788559b4839aab89e5ee6bafef6"],
      ["Candy-covered cake draft", "By Rixael · CC BY 4.0 · https://sketchfab.com/3d-models/none-170683a4e5c54b0e9e202064fb53f52a"],
      ["Stylized Lotus Flower", "By Kigha · CC BY 4.0 · https://sketchfab.com/3d-models/none-12768caa111f446b8796e70f9cc53a23"],
      ["Treasure chest, studio lighting", "By Poly Haven · CC0 (public domain) · https://polyhaven.com"],
    ],
  },
  safety: {
    title: 'Safety tips',
    sections: [
      [
        'Protect your info',
        'Never share bank details, OTPs or your home address.',
      ],
      [
        'Stay on REBU',
        'Keep chats and payments inside the app. Be careful with anyone who asks you to move to another app or send money.',
      ],
      [
        'Report & block',
        'If something feels off, report and block from the profile or chat menu.',
      ],
    ],
  },
};

const MONTH_NAMES = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** Admin page body → [heading, text] cards (blank line = new card, "# " = heading). */
function toSections(title, body) {
  return body
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const [first, ...rest] = block.split('\n');
      return /^#+\s/.test(first)
        ? [first.replace(/^#+\s*/, ''), rest.join('\n').trim()]
        : ['', block];
    })
    .map(([h, b], i) => [h || (i === 0 ? title : ''), b]);
}

export function ContentScreen({ route }) {
  const slug = route.params?.page || 'help';
  const [remote, setRemote] = useState(null);
  useFocusEffect(
    useCallback(() => {
      get(`/content/pages/${slug}`)
        .then(r => setRemote(r.page))
        .catch(() => setRemote(null)); // not published yet → bundled copy
    }, [slug]),
  );
  const local = CONTENT[slug] || CONTENT.help;
  const page = remote
    ? {
        title: remote.title,
        sections: toSections(remote.title, remote.body || ''),
        updated: remote.updated,
      }
    : local;
  const updated = page.updated ? new Date(page.updated) : null;
  return (
    <Screen scroll>
      <Header title={page.title} />
      <View style={{ paddingHorizontal: spacing.md, gap: 12 }}>
        {page.sections.map(([h, b], i) => (
          <Card key={`${i}${h}`}>
            {h ? <Txt variant="h3">{h}</Txt> : null}
            {b ? (
              <Txt
                variant="body"
                color={colors.textMuted}
                style={{ marginTop: h ? 6 : 0 }}
              >
                {b}
              </Txt>
            ) : null}
          </Card>
        ))}
        <Txt variant="tiny" center style={{ marginTop: 8 }}>
          {updated
            ? `Last updated ${updated.getDate()} ${
                MONTH_NAMES[updated.getMonth()]
              } ${updated.getFullYear()}`
            : 'Last updated 24 Oct 2026'}
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 10,
  },
  reasonActive: { borderColor: colors.primary, backgroundColor: '#FFF5F8' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  doneIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  verifyHero: {
    alignItems: 'center',
    padding: 24,
    borderRadius: radius.xl,
    marginBottom: 16,
  },
  selfieFrame: {
    width: 110,
    height: 130,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.white,
    marginTop: 14,
  },
  verifySub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFECF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
