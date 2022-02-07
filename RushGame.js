import Camera_t from './PopEngine/Camera.js'
import AssetManager from './PopEngine/AssetManager.js'
import {CreateCubeGeometry} from './PopEngine/CommonGeometry.js'
import {CreateTranslationMatrix,Add3,Subtract3,Multiply3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import {Dot3,lerp,LengthSq3} from './PopEngine/Math.js'
import * as PopMath from './PopEngine/Math.js'
import Pop from './PopEngine/PopEngine.js'

async function CreateUnitCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(-CubeSize,CubeSize);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}



const CubeCount = 32*32;
function GetCubePositionN(xyz,Index)
{
	const Div = Math.floor(Math.cbrt(CubeCount));
	let x = (Index % Div);
	let y = Math.floor( (Index % (Div*Div)) / Div );
	let z = Math.floor( Index / (Div*Div) );

	x -= Div/2;
	y -= Div/2;
	z -= Div/2;
	x *= CubeSize*2.5;
	y *= CubeSize*2.5;
	z *= CubeSize*2.5;
	x += xyz[0];
	y += xyz[1];
	z += xyz[2];
	
	//	add a tiny offset to make it a bit more random
	const RandomSize = CubeSize * 1.0;
	x += (Math.random() - 0.5) * RandomSize;
	y += (Math.random() - 0.5) * RandomSize;
	z += (Math.random() - 0.5) * RandomSize;
	
	return [x,y,z];
}

function GetCubeLocalToWorldN(xyz,Index)
{
	xyz = GetCubePositionN(xyz,Index);
	return CreateTranslationMatrix(...xyz);
}

function GetColourN(xyz,Index)
{
	return GetRandomColour();
	const r = lerp( 0.4, 0.9, Math.random() );
	const b = lerp( 0.4, 0.9, Math.random() );
	const g = lerp( 0.4, 0.9, Math.random() );
	return [r,g,b];
}


let CubeShader = null;
let CubePhysicsShader = null;
let AppCamera = new Camera_t();
//	try and emulate default XR pose a bit
AppCamera.Position = [0,0,0];
AppCamera.LookAt = [0,0,-1];
let DefaultDepthTexture = CreateRandomImage(16,16);
let CubePosition = AppCamera.LookAt.slice();
let CubeSize = 0.02;


const LocalToWorldTransforms = new Float32Array( new Array(CubeCount).fill(CubePosition.slice()).map( GetCubeLocalToWorldN ).flat(2) );
const Colours = new Float32Array( new Array(CubeCount).fill(0).map( GetColourN ).flat(2) );


class VoxelShape_t
{
	constructor()
	{
		this.Positions = [];
		this.AddPosition([0,0,0]);
		
		let Length = 0.3;
		for ( let z=0;	z<Length;	z+=CubeSize*2 )
			this.AddPosition([0,0,-z]);
	}
	
	AddPosition(xyz)
	{
		this.Positions.push(xyz);
	}
}

class Weapon_t
{
	constructor(LocalOriginOffset=[0,0,0])
	{
		this.LastFireTimeMs = null;		//	null button is up
		this.FireRepeatPerSec = 10;
		
		this.LocalForward = [0,0,-1];
		this.Shape = new VoxelShape_t();
		this.Position = [0,0,0];
		this.Rotation = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		this.LocalOriginOffset = LocalOriginOffset;
	}
	
	get FireRepeatAfterMs()
	{
		return Math.floor( 1000 / this.FireRepeatPerSec );
	}
	
	ReleaseFire()
	{
		this.LastFireTimeMs = null;
	}
	
	GetFirePosition()
	{
		const Offset = [0,0,-0.2];
		const Transform = this.GetLocalToWorldTransform(Offset);
		const Pos = PopMath.TransformPosition([0,0,0],Transform);
		return Pos;
	}
	
	GetLocalToWorldTransform(LocalOffset=[0,0,0])
	{
		LocalOffset = Add3( LocalOffset, this.LocalOriginOffset );
		
		let WorldTrans = PopMath.CreateTranslationMatrix( ...this.Position );
		let LocalTrans = PopMath.CreateTranslationMatrix( ...LocalOffset );
		
		let LocalToWorld = PopMath.MatrixMultiply4x4Multiple( LocalTrans, this.Rotation, WorldTrans );
		
		return LocalToWorld;
	}

	get Forward()
	{
		//	should use GetFirePosition()?
		let LocalToWorld = this.GetLocalToWorldTransform();
		let LocalForward = this.LocalForward;
		let LocalOrigin = [0,0,0];
		LocalForward = PopMath.TransformPosition( LocalForward, LocalToWorld  );
		LocalOrigin = PopMath.TransformPosition( LocalOrigin, LocalToWorld  );
		let WorldForward = Subtract3( LocalForward, LocalOrigin );
		WorldForward = PopMath.Normalise3( WorldForward );
		return WorldForward;
	}

	SetPosition(Position,Rotation)
	{
		this.Position = Position.slice();
		if ( Rotation )
			this.Rotation = Rotation.slice();
	}
	
	GetRenderLocalToWorldTransforms()
	{
		function TransformLocalPos(LocalPosition)
		{
			let LocalToWorld = this.GetLocalToWorldTransform(LocalPosition);
			return LocalToWorld;
		}
		let LocalPositions = this.Shape.Positions;
		let LocalTransforms = LocalPositions.map( TransformLocalPos.bind(this) );
		return LocalTransforms;
	}
}


function RenderCubes(PushCommand,RenderContext,CameraUniforms,CubeTransforms)
{
	if ( !CubeTransforms.length )
		return;
		
	const Geo = AssetManager.GetAsset('Cube01',RenderContext);
	const Shader = AssetManager.GetAsset(CubeShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.Colour = Colours.slice( 0, CubeTransforms.length*3 );

	const State = {};
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

function RenderPhysicsCubes(PushCommand,RenderContext,CameraUniforms,PositionsTexture,PhysicsPositionUvs)
{
	if ( !PositionsTexture )
		return;
		
	const Geo = AssetManager.GetAsset('Cube01',RenderContext);
	const Shader = AssetManager.GetAsset(CubePhysicsShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	//Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.Colour = Colours.slice( 0, PhysicsPositionUvs.length*3 );

	Uniforms.PhysicsPositionsTexture = PositionsTexture;
	Uniforms.PhysicsPositionsTextureSize = [PositionsTexture.GetWidth(),PositionsTexture.GetHeight()];
	Uniforms.PhysicsPositionUv = PhysicsPositionUvs;
	
	const State = {};
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

class Projectile_t
{
	constructor(Position,InitialForce,GravityMult=1,Drag=0.1)
	{
		this.Position = Position;
		this.Velocity = [0,0,0];
		this.Drag = Drag;
		
		let GravityPerSec = -6 * GravityMult;
		this.GravityForce = [0,GravityPerSec,0];
		this.PendingForce = InitialForce;
	}
	
	Move(TimestepSecs)
	{
		const Timestep3 = [TimestepSecs,TimestepSecs,TimestepSecs];
		
		//	apply drag
		const Damp = 1.0 - this.Drag;
		const Damp3 = [Damp,Damp,Damp];
		this.Velocity = Multiply3( this.Velocity, Damp3);
		
		//	apply forces
		let Force = this.PendingForce.slice();
		this.PendingForce = [0,0,0];
		Force = Add3( Force, Multiply3( this.GravityForce, Timestep3 ) );
		
		this.Velocity = Add3( this.Velocity, Force );
	
		let Delta = Multiply3( this.Velocity, Timestep3 );
		this.Position = Add3( this.Position, Delta );
	}
}

class Game_t
{
	constructor()
	{
		this.Weapons = {};	//	named weapons for different inputs
		this.Projectiles = [];
	}
	
	GetWeapons()
	{
		return Object.values(this.Weapons);
	}
	
	GetWeapon(Name)
	{
		if ( !this.Weapons[Name] )
		{
			const Offset = (Name=='Desktop') ? [0,-0.3,0.3] : [0,0,0];
			this.Weapons[Name] = new Weapon_t(Offset);
		}
		return this.Weapons[Name];
	}
	
	GetProjectileLocalToWorldTransforms()
	{
		function ProjectileToLocalToWorld(Projectile)
		{
			const LocalToWorld = PopMath.CreateTranslationMatrix( ...Projectile.Position );
			return LocalToWorld;
		}
		const Transforms = this.Projectiles.map( ProjectileToLocalToWorld );
		return Transforms;
	}
	
	CreateProjectile(Position,Forward,Force)
	{
		const Velocity = Multiply3( Forward, [Force,Force,Force] );
		this.Projectiles.push( new Projectile_t(Position, Velocity) );
	}
	
	OnFireWeapon(Weapon)
	{
		const MetresPerSec = 10;
		this.CreateProjectile( Weapon.GetFirePosition(), Weapon.Forward, MetresPerSec );
		Weapon.LastFireTimeMs = Pop.GetTimeNowMs();
	}
		
	OnDesktopFireDown()
	{
		const Weapon = this.GetWeapon('Desktop');
		this.OnFireWeapon(Weapon);
	}
	
	OnDesktopFireUp()
	{
		const Weapon = this.GetWeapon('Desktop');
		Weapon.ReleaseFire();
	}
	
	
	UpdateWeaponDesktop(Camera)
	{
		const Weapon = this.GetWeapon('Desktop');
		//	forward seems right on webxr camera/transform, but not our camera...
		Weapon.LocalForward = [0,0,1];
		let Rotation = Camera.GetLocalRotationMatrix();
		Rotation = PopMath.MatrixInverse4x4( Rotation );
		let Position = Camera.Position;
		//let Position = Subtract3( [0,0,0], Camera.Position );
		//Position = Add3( Position, [0,-0.3,0.0] );
		Weapon.SetPosition( Position, Rotation );
	}
	
	Tick(TimestepSecs)
	{
		//	repeat fire weapons
		function RepeatFireWeapon(Weapon)
		{
			if ( Weapon.LastFireTimeMs === null )
				return;
			const Elapsed = Pop.GetTimeNowMs() - Weapon.LastFireTimeMs;
			if ( Elapsed > Weapon.FireRepeatAfterMs )
				this.OnFireWeapon(Weapon);
		}
		const Weapons = this.GetWeapons();
		Weapons.forEach( RepeatFireWeapon.bind(this) );
	}
	
	
	GetPhysicsRenderCommands(TimestepSecs)
	{
		if ( !this.PhysicsPositions )
		{
			function GetPositon4(n,Index)
			{
				let xyz = GetCubePositionN(CubePosition,Index);
				return [...xyz,1];
			}
			let w = 32;
			let h = 32;
			let Float4s = new Array(w*h).fill(0).map(GetPositon4);
			Float4s = new Float32Array(Float4s.flat(2));
			this.PhysicsPositions = new Pop.Image();
			this.PhysicsPositions.WritePixels( w, h, Float4s, 'Float4' );
			this.PhysicsPositionsUvs = [];
			for ( let y=0;	y<h;	y++ )
			{
				for ( let x=0;	x<w;	x++ )
				{
					let uv = [x/w,y/h];
					this.PhysicsPositionsUvs.push(uv);
				}
			}
			//this.PhysicsPositionsUvs = this.PhysicsPositionsUvs.flat(2);
		}
		return [];
	}
	
	//	gr: this should really return commands?
	//		depends if we need to read it back...
	async GpuTick(RenderContext,TimestepSecs)
	{
		for ( let Projectile of this.Projectiles )
		{
			Projectile.Move(TimestepSecs);
		}

		//	generate rendercommands then run them
		const Commands = this.GetPhysicsRenderCommands(TimestepSecs);
		await RenderContext.Render(Commands);
	}
	
}


export default class App_t
{
	constructor()
	{
		this.RegisterAssets();
		this.Game = new Game_t();
	}
	
	get Camera()	{	return AppCamera;	}
	
	RegisterAssets()
	{
		if ( CubeShader )
			return;
		AssetManager.RegisterAssetAsyncFetchFunction('Cube01', CreateUnitCubeTriangleBuffer );

		const VertFilename = 'Geo.vert.glsl';
		const FragFilename = 'Colour.frag.glsl';
		CubeShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);

		const VertPhysicsFilename = 'PhysicsGeo.vert.glsl';
		CubePhysicsShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertPhysicsFilename);
	}
	
	BindXrControls(Device)
	{
		const Game = this.Game;
		Device.OnMouseMove = function(xyz,Button,InputName,Transform)
		{
			//	false when not tracking
			if ( Transform )
			{
				const Weapon = Game.GetWeapon(InputName);
				let Rotation = Transform.matrix;
				PopMath.SetMatrixTranslation(Rotation,0,0,0,1);
		
				Weapon.SetPosition(xyz,Rotation);
			}
		}
		
		Device.OnMouseDown = function(xyz,Button,InputName,Transform)
		{
			//	update position as move isn't called when mouse is down
			Device.OnMouseMove( ...arguments );
			
			const Weapon = Game.GetWeapon(InputName);
			Game.OnFireWeapon(Weapon);
		}

		Device.OnMouseUp = function(xyz,Button,InputName,Transform)
		{
			const Weapon = Game.GetWeapon(InputName);
			Weapon.ReleaseFire();
		}
	}
	
	BindMouseCameraControls(RenderView)
	{
		const Camera = this.Camera;
		const Game = this.Game;
		
		RenderView.OnMouseDown = function(x,y,Button,FirstDown=true)
		{
			if ( Button == 'Left' )
			{
				if ( FirstDown )
					Game.OnDesktopFireDown();
				Camera.OnCameraOrbit( x, y, 0, FirstDown!=false );
			}
			
			if ( Button == 'Right' )
				Camera.OnCameraPan( x, y, 0, FirstDown!=false );
		}
		
		RenderView.OnMouseMove = function(x,y,Button)
		{
			RenderView.OnMouseDown( x, y, Button, false );
		}
		
		RenderView.OnMouseScroll = function(x,y,Button,Delta)
		{
			Camera.OnCameraPanLocal( x, y, 0, true );
			Camera.OnCameraPanLocal( x, y, -Delta[1] * 10.0, false );
			//Camera.OnCameraZoom( -Delta[1] * 0.1 );
		}
		
		RenderView.OnMouseUp = function(x,y,Button)
		{
			if ( Button == 'Left' )
				Game.OnDesktopFireUp();
		}
	}
	
	GetDesktopRenderCommands(RenderContext,RenderView)
	{
		//	update camera
		const Viewport = RenderView.GetScreenRect();
		
		return this.GetSceneRenderCommands( RenderContext, this.Camera, Viewport );
	}
	
	GetXrRenderCommands(RenderContext,Camera)
	{
		return this.GetSceneRenderCommands(...arguments);
	}
	
	GetSceneRenderCommands(RenderContext,Camera,Viewport=[0,0,1,1])
	{
		//	make screen camera track xr camera
		AppCamera.Position = Camera.Position.slice();
		AppCamera.LookAt = Camera.LookAt.slice();
		
		this.RegisterAssets();
		
		
		const ClearCommand = ['SetRenderTarget',null,[0.1,0.1,0.1]];

		const CameraUniforms = {};
		//	normalise viewport
		Viewport[0] = 0;
		Viewport[1] = 0;
		Viewport[3] /= Viewport[2];
		Viewport[2] /= Viewport[2];
		CameraUniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
		CameraUniforms.CameraToWorldTransform = Camera.GetLocalToWorldMatrix();
		CameraUniforms.CameraProjectionTransform = Camera.GetProjectionMatrix(Viewport);
		CameraUniforms.DepthTexture = Camera.DepthImage || DefaultDepthTexture;
		CameraUniforms.NormalDepthToViewDepthTransform = CameraUniforms.DepthTexture.NormalDepthToViewDepthTransform || [];


		const CubeCommands = [];
		function PushCommand(Command)
		{
			CubeCommands.push(Command);
		}
		
		//RenderCubes( PushCommand, RenderContext, CameraUniforms, LocalToWorldTransforms );
		RenderPhysicsCubes( PushCommand, RenderContext, CameraUniforms, this.Game.PhysicsPositions, this.Game.PhysicsPositionsUvs );

		this.Game.UpdateWeaponDesktop(Camera);
		
		for ( let Weapon of this.Game.GetWeapons() )
		{
			const Positions = Weapon.GetRenderLocalToWorldTransforms();
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Positions );
		}
		
		{
			const Positions = this.Game.GetProjectileLocalToWorldTransforms();
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Positions );
		}
		

		return [ClearCommand,...CubeCommands];
	}
	
	Tick(TimestepSecs)
	{
		this.Game.Tick(TimestepSecs);
	}
	
	async GpuTick(RenderContext,TimestepSecs)
	{
		return this.Game.GpuTick(RenderContext,TimestepSecs);
	}
}
