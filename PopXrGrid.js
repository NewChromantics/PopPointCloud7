import Pop from './PopEngine/PopEngine.js'
import FrameCounter_t from './PopEngine/FrameCounter.js'
import App_t from './RushGame.js'
import {WaitForFrame} from './PopEngine/PopWebApi.js'
let LastXrRenderTimeMs = null;


async function RenderLoop(Canvas,XrOnWaitForCallback)
{
	const RenderView = new Pop.Gui.RenderView(null,Canvas);
	const RenderContext = new Pop.Sokol.Context(RenderView);
	
	
	let App = new App_t();
	App.BindMouseCameraControls( RenderView );
		
	//	simple thread for now, we will want to change this at some point to 
	//	a) provide gpu access for physics updates
	//	b) time it so its right after XR controller update
	//	c) time it right after XR render? (for physics etc)
	//	c) should it be async?...
	async function TickThread()
	{
		while (true)
		{
			const TimestepSecs = await WaitForFrame();
			App.Tick(TimestepSecs);
		}
	}
	TickThread();
		
		
	function GetXrRenderCommands()
	{
		LastXrRenderTimeMs = Pop.GetTimeNowMs();
		return App.GetXrRenderCommands(...arguments);
	}
			
	async function XrLoop(RenderContext,XrOnWaitForCallback)
	{
		while ( true )
		{
			try
			{
				LastXrRenderTimeMs = null;
				const Device = await Pop.Xr.CreateDevice( RenderContext, GetXrRenderCommands, XrOnWaitForCallback );
				App.BindXrControls( Device );

				await Device.WaitForEnd();
			}
			catch(e)
			{
				console.error(`Failed to create xr ${e}`);
				await Pop.Yield(1*1000);
			}
		}
	}

	if ( XrOnWaitForCallback )
		XrLoop(RenderContext,XrOnWaitForCallback).catch(console.error);
	
	
	const FrameCounter = new FrameCounter_t(`Render`);
	
	while ( RenderView )
	{
		let Commands = [];
		try
		{
			Commands = App.GetDesktopRenderCommands(RenderContext,RenderView);
		}
		catch(e)
		{
			console.error(e);
			const ClearRed = ['SetRenderTarget',null,[1,0,0]];
			Commands.splice(0,0,ClearRed);
		}
		
		await RenderContext.Render(Commands);
		FrameCounter.Add();

		//	only intermediately render if xr is running
		//	todo: check time since render and "turn on" again if we havent XR rendered for a while
		if ( Pop.GetTimeNowMs() - LastXrRenderTimeMs > 2*1000 )
			LastXrRenderTimeMs = null;
		if ( LastXrRenderTimeMs )
			await Pop.Yield(10*1000);
	}
}


export default async function Bootup(XrOnWaitForCallback)
{
	await RenderLoop('Window',XrOnWaitForCallback);
}
