import copy, unittest
from scraper_one_metadata_shadow import exact_video_preview, author_registry, enrich, video_id, relationship_review

def body(mid='123',image='https://scontent.example.fbcdn.net/image.jpg',kind='video.other'):
    return f'<meta property="og:url" content="https://www.facebook.com/reel/{mid}/"><meta property="og:type" content="{kind}"><meta property="og:image" content="{image}">'

class Guards(unittest.TestCase):
    def test_exact_video(self):self.assertEqual(exact_video_preview(body(),'https://www.facebook.com/page/videos/123/','123')['id'],'123')
    def test_wrong_id(self):self.assertIsNone(exact_video_preview(body('124'),'https://www.facebook.com/watch/?v=123','123'))
    def test_unrelated_redirect(self):self.assertIsNone(exact_video_preview(body(),'https://www.facebook.com/login/','123'))
    def test_generic_image(self):self.assertIsNone(exact_video_preview(body(kind='website'),'https://www.facebook.com/watch/?v=123','123'))
    def test_external_image(self):self.assertIsNone(exact_video_preview(body(image='https://fbcdn.net.evil.test/a'),'https://www.facebook.com/watch/?v=123','123'))
    def test_duplicate_canonical(self):self.assertIsNone(exact_video_preview(body()+body(),'https://www.facebook.com/watch/?v=123','123'))
    def test_url_not_arbitrary_number(self):self.assertIsNone(video_id('https://www.facebook.com/photos/123/'))
    def test_numeric_profile_not_publisher(self):
        r={'inputUrl':'https://www.facebook.com/123','author':{'id':'124','name':'Wrong'}}
        self.assertEqual(author_registry([r],{'123'}),{})
    def test_conflicting_names_hold(self):
        rs=[{'inputUrl':'https://www.facebook.com/123','author':{'id':'123','name':n}} for n in ['A','B']]
        self.assertEqual(author_registry(rs,{'123'}),{})
    def test_foreign_author_cannot_create_shared_relationship(self):
        r={'inputUrl':'https://www.facebook.com/SharingPage','author':{'id':'123','profileUrl':'https://www.facebook.com/Original'},'isReshare':False}
        self.assertIsNotNone(relationship_review(r,{}));self.assertNotIn('sharedPost',r)
    def test_exact_profile_alias_does_not_raise_review(self):
        r={'inputUrl':'https://www.facebook.com/govpe','author':{'id':'123','profileUrl':'https://www.facebook.com/profile.php?id=123'}}
        self.assertIsNone(relationship_review(r,{'123':{'profileUrl':'https://www.facebook.com/govpe'}}))
    def test_empty_shared_container_does_not_supply_content(self):
        out,proof=enrich({'sharedPost':{'postId':'1','postText':None}}, {}, {})
        self.assertEqual(proof['holds'][0]['reason'],'caption_and_image_unavailable')
    def test_declared_share_without_original_holds(self):
        out,proof=enrich({'isReshare':True,'postText':'sharing'}, {}, {})
        self.assertEqual(proof['holds'][0]['reason'],'declared_reshare_without_original')
    def test_enrichment_preserves_raw_and_order_and_roles(self):
        r={'postId':'7','url':'https://www.facebook.com/a/posts/7','timestamp':100,'inputUrl':'https://www.facebook.com/SharingPage','postText':'outer','author':{'id':'123'},'attachments':[{'id':'9','type':'video','url':'video.mp4'},{'id':'8','type':'photo','url':'b.jpg'}],'sharedPost':{'postText':'original offer','author':{'id':'456','name':'Original'},'attachments':[{'id':'6','type':'photo','url':'c.jpg'}]}}
        before=copy.deepcopy(r);out,proof=enrich(r,{'123':{'id':'123','name':'Actual author'}},{'9':{'id':'9','imageVerified':True,'imageUrl':'thumb.jpg'}})
        self.assertEqual(r,before);self.assertEqual([x['id'] for x in out['attachments']],['9','8'])
        self.assertEqual(out['sharedPost'],r['sharedPost']);self.assertEqual(out['url'],r['url']);self.assertEqual(out['timestamp'],100)
        self.assertEqual(proof['requestedPublisherUrl'],r['inputUrl']);self.assertEqual(proof['contentAuthorId'],'123')
        self.assertEqual(out['author']['name'],'Actual author');self.assertEqual(out['attachments'][0]['thumbnailUrl'],'thumb.jpg')
    def test_unverified_preview_and_wrong_author_proof_hold(self):
        r={'author':{'id':'123'},'attachments':[{'type':'video','id':'9'}]}
        out,proof=enrich(r,{'123':{'id':'124','name':'Wrong'}},{'9':{'id':'9','imageVerified':False,'imageUrl':'x'}})
        self.assertEqual(out,r);self.assertEqual(len(proof['enrichment']),0);self.assertEqual(len(proof['holds']),3)

if __name__=='__main__':unittest.main()
