import unittest
from scraper_one_acquisition_checks import assess,budget_usd

class OperationalGuards(unittest.TestCase):
    def test_green_throttle_is_failure(self):
        self.assertEqual(assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[],'Rate limit reached')['operationalStatus'],'rate_limited')
    def test_quiet_page_is_complete(self):
        self.assertEqual(assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[],'https://www.facebook.com/a -> finished collecting posts: 0/10')['operationalStatus'],'complete')
    def test_facebook_host_alias_completes_same_exact_path(self):
        self.assertEqual(assess(['https://facebook.com/a'],10,'SUCCEEDED','',[],'https://www.facebook.com/a -> finished collecting posts: 1/10')['operationalStatus'],'complete')
    def test_other_host_does_not_complete_source(self):
        self.assertEqual(assess(['https://facebook.com/a'],10,'SUCCEEDED','',[],'https://www.example.com/a -> finished collecting posts: 1/10')['operationalStatus'],'incomplete_sources')
    def test_empty_without_evidence_is_failure(self):
        self.assertEqual(assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[],'done')['operationalStatus'],'incomplete_sources')
    def test_terminal_unavailable_is_explicit_hold(self):
        x=assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[{'inputUrl':'https://www.facebook.com/a','error':'PAGE_UNAVAILABLE'}],'done')
        self.assertEqual(x['operationalStatus'],'complete_with_source_holds');self.assertEqual(x['sourcesFinished'],0)
    def test_unrelated_diagnostic_does_not_complete_source(self):
        self.assertEqual(assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[{'inputUrl':'https://www.facebook.com/b','error':'PAGE_UNAVAILABLE'}],'done')['operationalStatus'],'incomplete_sources')
    def test_depth_clamping(self):
        self.assertEqual(assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[],'https://www.facebook.com/a -> finished collecting posts: 2/2')['operationalStatus'],'depth_clamped')
    def test_depth_cap_is_visible(self):
        self.assertTrue(assess(['https://www.facebook.com/a'],10,'SUCCEEDED','',[],'https://www.facebook.com/a -> finished collecting posts: 10/10')['sourcesAtDepthLimit'])
    def test_reserve_full_depth(self):self.assertEqual(budget_usd(80,10),2.00025)
    def test_invalid_budget(self):
        with self.assertRaises(ValueError):budget_usd(101,10)

if __name__=='__main__':unittest.main()
