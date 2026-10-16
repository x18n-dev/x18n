<h1>{{ __('messages.dashboard.title') }}</h1>
<p>{{ __('messages.welcome', ['name' => $user->name]) }}</p>
<p>@lang('messages.dashboard.missing')</p>
<a href="/logout">{{ __('Log out') }}</a>
